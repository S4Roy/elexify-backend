import { randomUUID } from "node:crypto";
import ZohoConnection from "../../models/ZohoConnection.js";
import ZohoSyncJob from "../../models/ZohoSyncJob.js";
import ZohoIntegrationLog from "../../models/ZohoIntegrationLog.js";
import ZohoLease from "../../models/ZohoLease.js";
import Order from "../../models/Order.js";
import { acquireLease, releaseLease } from "./ZohoLease.js";
import { ZohoError, retryDelay } from "./ZohoBooksClient.js";
import { syncItem } from "./ZohoItemService.js";
import { syncContact } from "./ZohoContactService.js";
import { syncSalesOrder, assertOrderEligible } from "./ZohoSalesOrderService.js";
import { reconcileSourceChanges } from "./ZohoSourceChanges.js";

export const enqueueSync = async (connection, kind, entityId, { sourceVersion = 0, retry = false } = {}) => {
  if (!connection?.enabled || !connection.connected) throw new ZohoError("ZOHO_SYNC_DISABLED");
  if (kind === "order_contact") {
    const order = await Order.findById(entityId).lean();
    if (!order || order.deleted_at) throw new ZohoError("ORDER_NOT_FOUND");
  }
  if (kind === "salesorder") assertOrderEligible(await Order.findById(entityId).lean());
  const key = { organization_id: connection.organization_id, kind, entity_id: entityId };
  try { await ZohoSyncJob.updateOne(key, { $setOnInsert: { ...key, source_version: sourceVersion } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  if (retry || sourceVersion) {
    const filter = { ...key, ...(retry ? {} : { source_version: { $lt: sourceVersion } }) };
    await ZohoSyncJob.updateOne(filter, { $inc: { revision: 1 }, $max: { source_version: sourceVersion },
      $set: { status: "queued", next_attempt_at: new Date(), attempts: 0, last_error: null } });
  }
  return ZohoSyncJob.findOne(key).lean();
};

export const reconcilePackedOrders = async connection => {
  const lifecycle = await Order.find({ "zoho.salesorder_id": { $type: "string" }, "zoho.sync_status": { $ne: "review" },
    "zoho.organization_id": connection.organization_id,
    $or: [{ order_status: { $in: ["cancelled", "returned", "return_requested"] } },
      { payment_status: { $in: ["refunded", "partially_refunded", "refund_pending", "refund_failed"] } }],
  }).sort({ _id: 1 }).limit(100).lean();
  for (const order of lifecycle) {
    await Order.updateOne({ _id: order._id }, { $set: { "zoho.sync_status": "review" } });
    await ZohoSyncJob.updateOne({ organization_id: connection.organization_id, kind: "salesorder", entity_id: order._id },
      { $set: { status: "review", last_error: "ORDER_LIFECYCLE_REVIEW_REQUIRED" }, $inc: { revision: 1 } });
    await ZohoIntegrationLog.create({ organization_id: connection.organization_id, entity_id: order._id, kind: "salesorder", event: "review", code: "ORDER_LIFECYCLE_REVIEW_REQUIRED" });
  }
  const orders = await Order.find({ "zoho.packed_at": { $gte: connection.enabled_since }, deleted_at: null,
    $expr: { $gt: ["$zoho.version", { $ifNull: ["$zoho.completed_version", 0] }] },
  }).sort({ "zoho.packed_at": 1 }).limit(100).lean();
  for (const order of orders) {
    try { await enqueueSync(connection, "salesorder", order._id, { sourceVersion: order.zoho.version }); }
    catch (error) {
      if (!(error instanceof ZohoError)) throw error;
      await Order.updateOne({ _id: order._id }, { $set: { "zoho.sync_status": "review" }, $max: { "zoho.completed_version": order.zoho.version } });
      await ZohoIntegrationLog.create({ organization_id: connection.organization_id, kind: "salesorder", entity_id: order._id, event: "review", code: error.code });
    }
  }
};

// Discover committed orders independently of packing and financial export.
// Mark only after durable enqueue; replay after a crash reuses the unique job.
export const reconcileOrderContacts = async connection => {
  if (!connection.enabled_since) return;
  const orders = await Order.find({
    deleted_at: null,
    created_at: { $gte: connection.enabled_since },
    "zoho.contact_queued_organization_id": { $ne: connection.organization_id },
  }).sort({ created_at: 1, _id: 1 }).limit(100).lean();
  for (const order of orders) {
    await enqueueSync(connection, "order_contact", order._id);
    await Order.updateOne({ _id: order._id }, {
      $set: { "zoho.contact_queued_organization_id": connection.organization_id },
    });
  }
};

export const processZohoQueue = async () => {
  const connection = await ZohoConnection.findOne({ key: "books", connected: true, enabled: true });
  if (!connection) return;
  if (connection.paused_until > new Date()) return;
  const lease = await acquireLease(`zoho-worker:${connection.organization_id}`, 120000);
  if (!lease) return;
  let leaseLost = false;
  const heartbeat = setInterval(async () => {
    try {
      const result = await ZohoLease.updateOne({ ...lease, until: { $gt: new Date() } }, { $set: { until: new Date(Date.now() + 120000) } });
      if (!result.matchedCount) leaseLost = true;
    } catch { leaseLost = true; }
  }, 30000);
  heartbeat.unref();
  try {
    await reconcileOrderContacts(connection);
    await reconcilePackedOrders(connection);
    await reconcileSourceChanges(connection, enqueueSync);
    for (let count = 0; count < 20 && !leaseLost; count++) {
      if (!await ZohoConnection.exists({ _id: connection._id, enabled: true, connected: true, generation: connection.generation })) break;
      const owner = randomUUID();
      const job = await ZohoSyncJob.findOneAndUpdate({ organization_id: connection.organization_id,
        $or: [{ status: { $in: ["queued", "retrying"] }, next_attempt_at: { $lte: new Date() } },
          { status: "running", lease_until: { $lt: new Date() } }],
      }, { $set: { status: "running", lease_owner: owner, lease_until: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { new: true, sort: { next_attempt_at: 1 } });
      if (!job) break;
      const fence = { _id: job._id, lease_owner: owner, revision: job.revision };
      let status = "synced";
      let code;
      let delay = 0;
      try {
        if (job.kind === "salesorder") await syncSalesOrder(connection, job.entity_id);
        else if (job.kind === "order_contact") {
          const order = await Order.findById(job.entity_id).lean();
          if (!order || order.deleted_at) throw new ZohoError("ORDER_NOT_FOUND");
          await syncContact(connection, order.user, order);
        }
        else if (job.kind === "contact") await syncContact(connection, job.entity_id);
        else await syncItem(connection, job.entity_id, job.kind === "variation");
      } catch (error) {
        code = error instanceof ZohoError ? error.code : "ZOHO_INTERNAL_ERROR";
        status = error.ambiguous || code.includes("REVIEW") ? "review" :
          (!(error instanceof ZohoError) || error.retryable) && job.attempts < 8 ? "retrying" : "dead_letter";
        delay = retryDelay(job.attempts, error.retryAfter || 0);
        if (code.startsWith("ZOHO_HTTP_429")) await ZohoConnection.updateOne({ _id: connection._id }, { $set: { paused_until: new Date(Date.now() + delay) } });
      }
      if (leaseLost) break;
      const result = await ZohoSyncJob.updateOne(fence, { $set: { status, last_error: code || null,
        next_attempt_at: new Date(Date.now() + delay), ...(status === "synced" ? { synced_at: new Date() } : {}) },
        $unset: { lease_owner: "", lease_until: "" } });
      if (result.matchedCount) {
        if (job.kind === "salesorder") await Order.updateOne({ _id: job.entity_id }, {
          $set: { "zoho.sync_status": status, ...(status === "synced" ? { "zoho.synced_at": new Date() } : {}) },
          ...(status !== "retrying" ? { $max: { "zoho.completed_version": job.source_version } } : {}),
        });
        if (status === "synced") await ZohoConnection.updateOne({ _id: connection._id }, { $set: { last_success_at: new Date() } });
        await ZohoIntegrationLog.create({ job_id: job._id, organization_id: connection.organization_id,
          event: status, kind: job.kind, entity_id: job.entity_id, attempt: job.attempts, code });
      }
      if (status === "retrying") break;
    }
  } finally { clearInterval(heartbeat); await releaseLease(lease); }
};
