import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";
import { StatusError } from "../../config/index.js";
import ZohoConnection from "../../models/ZohoConnection.js";
import ZohoSyncJob from "../../models/ZohoSyncJob.js";
import ZohoMapping from "../../models/ZohoMapping.js";
import ZohoLease from "../../models/ZohoLease.js";
import ZohoOAuthState from "../../models/ZohoOAuthState.js";
import ZohoIntegrationLog from "../../models/ZohoIntegrationLog.js";
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import User from "../../models/User.js";
import { beginAuthorization, completeAuthorization, disconnect } from "../../services/zoho/ZohoAuthService.js";
import { booksClient, REGIONS, ZohoError } from "../../services/zoho/ZohoBooksClient.js";
import { enqueueSync } from "../../services/zoho/ZohoSyncQueue.js";
import { getIntegrationConfig } from "../../services/integrationCredentials/index.js";
import Invoice from "../../models/Invoice.js";

export const zohoBooksRouter = Router();
const view = requirePermission(PERMISSIONS.ZOHO_SYNC_VIEW);
const manage = requirePermission(PERMISSIONS.ZOHO_SYNC_MANAGE);
const configure = requirePermission(PERMISSIONS.INTEGRATION_CREDENTIAL_MANAGE);
const body = schema => celebrate({ [Segments.BODY]: Joi.object(schema).required() });
const objectId = Joi.string().hex().length(24).required();
const idParams = celebrate({ [Segments.PARAMS]: Joi.object({ id: objectId }) });
const current = async () => {
  const connection = await ZohoConnection.findOne({ key: "books" });
  if (!connection?.connected) throw StatusError.conflict("Connect Zoho Books first");
  return connection;
};
const storedConnection = async () => {
  const connection = await ZohoConnection.findOne({ key: "books" });
  if (!connection?.organization_id) throw StatusError.conflict("Select a Zoho organization first");
  return connection;
};
const endpoint = action => async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try { res.json({ status: "success", data: await action(req) }); }
  catch (error) { next(error instanceof ZohoError ? new StatusError(error.retryable ? 503 : 409,
    error.detail?.message ? `${error.code}: ${error.detail.message}` : error.code) :
    error instanceof StatusError ? error : StatusError.serverError("Zoho integration operation failed")); }
};
const audit = (req, event, extra = {}) => ZohoIntegrationLog.create({ actor_id: req.auth.user_id, event, ...extra });

zohoBooksRouter.get("/", view, endpoint(async () => {
  const connection = await ZohoConnection.findOne({ key: "books" }).lean();
  const counts = connection?.organization_id ? await ZohoSyncJob.aggregate([
    { $match: { organization_id: connection.organization_id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]) : [];
  return { connection, counts };
}));

zohoBooksRouter.post("/connect", configure, body({ region: Joi.string().valid(...Object.keys(REGIONS)).required() }), endpoint(async req => {
  for (const model of [ZohoConnection, ZohoOAuthState, ZohoLease, ZohoMapping, ZohoSyncJob, ZohoIntegrationLog]) await model.createIndexes();
  const connection = await ZohoConnection.findOne({ key: "books" });
  if (connection?.organization_id && connection.region !== req.body.region) throw StatusError.conflict("Existing mappings belong to another data center");
  const url = await beginAuthorization(req.auth.user_id, req.body.region);
  await audit(req, "oauth_started");
  return { url };
}));
zohoBooksRouter.post("/callback", configure, body({ state: Joi.string().hex().length(64).required(), code: Joi.string().max(4096).required() }), endpoint(async req => {
  await completeAuthorization(req.auth.user_id, req.body.state, req.body.code);
  await audit(req, "oauth_connected");
  return { connected: true };
}));
zohoBooksRouter.post("/disconnect", configure, body({ reason: Joi.string().trim().min(10).max(500).required() }), endpoint(async req => {
  await disconnect();
  await audit(req, "oauth_disconnected");
  return { connected: false };
}));
zohoBooksRouter.get("/organizations", configure, endpoint(async () => {
  const result = await booksClient(await current(), "GET", "organizations", { organization: false });
  return (result.organizations || []).map(organization => ({ organization_id: organization.organization_id, name: organization.name, currency_code: organization.currency_code }));
}));
zohoBooksRouter.put("/configuration", configure, body({
  organization_id: Joi.string().pattern(/^\d+$/).required(), enabled: Joi.boolean().required(),
  tax_map: Joi.object().pattern(/^(intra|inter|cod):\d+(\.\d+)?$/, Joi.string().pattern(/^\d+$/)).max(100).required(),
}), endpoint(async req => {
  const connection = await current();
  if (connection.organization_id && connection.organization_id !== req.body.organization_id) throw StatusError.conflict("Organization changes require a reviewed mapping migration");
  if (!connection.organization_id) {
    const legacy = await getIntegrationConfig("zoho", { org_id: process.env.ZOHO_ORG_ID });
    const existingInvoices = await Invoice.exists({ "zoho.invoice_id": { $type: "string" } });
    const existingCustomers = await User.exists({ zoho_customer_id: { $type: "string" } });
    if ((existingInvoices || existingCustomers) && legacy?.org_id !== req.body.organization_id) {
      throw StatusError.conflict("Existing Zoho mappings require the original organization; migration needs review");
    }
  }
  const result = await booksClient(connection, "GET", "organizations", { organization: false });
  const organization = result.organizations?.find(candidate => String(candidate.organization_id) === req.body.organization_id);
  if (!organization) throw StatusError.badRequest("Organization is not accessible");
  connection.organization_id = req.body.organization_id;
  connection.currency = organization.currency_code;
  connection.tax_map = req.body.tax_map;
  connection.enabled = req.body.enabled;
  connection.generation += 1;
  if (!connection.enabled_since && connection.enabled) connection.enabled_since = new Date();
  await connection.save();
  await audit(req, "configuration_updated", { organization_id: connection.organization_id });
  return connection;
}));

zohoBooksRouter.get("/jobs", view, celebrate({ [Segments.QUERY]: Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  status: Joi.string().valid("queued", "running", "retrying", "synced", "dead_letter", "review"),
}) }), endpoint(async req => {
  const connection = await storedConnection();
  const filter = { organization_id: connection.organization_id, ...(req.query.status ? { status: req.query.status } : {}) };
  return { jobs: await ZohoSyncJob.find(filter).sort({ updatedAt: -1 }).skip((req.query.page - 1) * 50).limit(50).lean(), total: await ZohoSyncJob.countDocuments(filter) };
}));
zohoBooksRouter.get("/logs", view, celebrate({ [Segments.QUERY]: Joi.object({ page: Joi.number().integer().min(1).max(10000).default(1), paginated: Joi.boolean().default(false) }) }), endpoint(async req => {
  const connection = await storedConnection();
  const filter = { $or: [{ organization_id: connection.organization_id }, { organization_id: { $exists: false } }] };
  const logs = await ZohoIntegrationLog.find(filter)
    .sort({ created_at: -1, _id: -1 }).skip((req.query.page - 1) * 50).limit(50).lean();
  return req.query.paginated ? { logs, total: await ZohoIntegrationLog.countDocuments(filter) } : logs;
}));
zohoBooksRouter.post("/sync", manage, body({ kind: Joi.string().valid("item", "variation", "contact", "order_contact", "salesorder").required(), ids: Joi.array().items(objectId).min(1).max(100).unique().required() }), endpoint(async req => {
  const connection = await current();
  const jobs = [];
  for (const entityId of req.body.ids) jobs.push(await enqueueSync(connection, req.body.kind, entityId, { retry: true }));
  await audit(req, "manual_sync_requested", { organization_id: connection.organization_id, kind: req.body.kind });
  return jobs;
}));
zohoBooksRouter.post("/jobs/:id/retry", manage, idParams, endpoint(async req => {
  const connection = await current();
  const job = await ZohoSyncJob.findOne({ _id: req.params.id, organization_id: connection.organization_id });
  if (!job) throw StatusError.notFound("Job not found");
  if (!["dead_letter", "review", "retrying"].includes(job.status)) throw StatusError.conflict("Job is not failed");
  const result = await enqueueSync(connection, job.kind, job.entity_id, { retry: true });
  await audit(req, "retry_requested", { job_id: job._id, organization_id: connection.organization_id });
  return result;
}));
zohoBooksRouter.get("/orders/:id", view, idParams, endpoint(async req => {
  const order = await Order.findOne({ _id: req.params.id, deleted_at: null }).select("zoho user id").lean();
  if (!order) throw StatusError.notFound("Order not found");
  const connection = await ZohoConnection.findOne({ key: "books" });
  const job = connection?.organization_id ? await ZohoSyncJob.findOne({ organization_id: connection.organization_id, kind: "salesorder", entity_id: req.params.id }).lean() : null;
  let customer = { contact_id: null, job: null };
  if (connection?.organization_id) {
    const user = order.user ? await User.findById(order.user).select("zoho_contact_id zoho_customer_id zoho_organization_id").lean() : null;
    const identity = user ? String(order.user) : `order-${order.id}`;
    const mapping = await ZohoMapping.findOne({ organization_id: connection.organization_id, kind: "contact", identity, state: "mapped" }).lean();
    customer = {
      contact_id: mapping?.remote_id || (user?.zoho_organization_id === connection.organization_id ? user.zoho_contact_id || user.zoho_customer_id : null) || null,
      job: await ZohoSyncJob.findOne({ organization_id: connection.organization_id, kind: "order_contact", entity_id: req.params.id }).lean(),
    };
  }
  return { zoho: order.zoho, job, customer, enabled: Boolean(connection?.connected && connection?.enabled) };
}));
zohoBooksRouter.put("/accounting", configure, body({
  kind: Joi.string().valid("item", "variation", "contact").required(), id: objectId,
  hsn_sac: Joi.string().pattern(/^\d{4,8}$/), accounting_unit: Joi.string().trim().max(20), zoho_tax_id: Joi.string().pattern(/^\d+$/),
  gstin: Joi.string().pattern(/^[0-9]{2}[A-Z0-9]{13}$/),
  gst_treatment: Joi.string().valid("business_gst", "business_none", "overseas", "consumer"),
}), endpoint(async req => {
  const model = req.body.kind === "contact" ? User : req.body.kind === "variation" ? ProductVariation : Product;
  const allowed = req.body.kind === "contact" ? ["gstin", "gst_treatment"] : ["hsn_sac", "accounting_unit", "zoho_tax_id"];
  const changes = Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
  const result = await model.updateOne({ _id: req.body.id }, { $set: changes }, { runValidators: true });
  if (!result.matchedCount) throw StatusError.notFound("Entity not found");
  await audit(req, "accounting_metadata_updated", { kind: req.body.kind, entity_id: req.body.id });
  return { updated: true };
}));
