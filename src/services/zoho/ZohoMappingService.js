import ZohoMapping from "../../models/ZohoMapping.js";
import ZohoLease from "../../models/ZohoLease.js";
import { booksClient, ZohoError } from "./ZohoBooksClient.js";
import { acquireLease, releaseLease } from "./ZohoLease.js";

export const findExact = async (connection, path, params, predicate) => {
  const matches = [];
  for (let page = 1; page <= 100; page++) {
    const result = await booksClient(connection, "GET", path, { params: { ...params, page, per_page: 200 } });
    if (!Array.isArray(result[path])) throw new ZohoError("INVALID_ZOHO_LIST_RESPONSE");
    matches.push(...result[path].filter(predicate));
    if (matches.length > 1) throw new ZohoError("MULTIPLE_REMOTE_MATCHES_REVIEW_REQUIRED");
    if (!result.page_context?.has_more_page) return matches[0] || null;
  }
  throw new ZohoError("REMOTE_LOOKUP_LIMIT_REVIEW_REQUIRED");
};

// onCreateConflict(error) may adjust `payload` and return true to retry the
// create once — used when Zoho rejects a new contact whose display name is
// already taken by a different customer.
export const syncMapped = async ({ connection, kind, identity, path, singular, payload, lookup, beforeUpdate, onCreateConflict }) => {
  const key = { organization_id: connection.organization_id, kind, identity };
  const lease = await acquireLease(`mapping:${key.organization_id}:${kind}:${kind === "contact" ? "all" : identity}`, 120000);
  if (!lease) throw new ZohoError("ZOHO_MAPPING_BUSY", { retryable: true });
  let lost = false;
  const heartbeat = setInterval(async () => {
    try {
      const result = await ZohoLease.updateOne({ ...lease, until: { $gt: new Date() } }, { $set: { until: new Date(Date.now() + 120000) } });
      if (!result.matchedCount) lost = true;
    } catch { lost = true; }
  }, 30000);
  heartbeat.unref();
  const assertLease = async () => {
    if (lost || !await ZohoLease.exists({ ...lease, until: { $gt: new Date() } })) throw new ZohoError("ZOHO_MAPPING_LEASE_LOST", { retryable: true });
  };
  try {
    let mapping = await ZohoMapping.findOneAndUpdate(key, { $setOnInsert: key }, { upsert: true, new: true });
    let remote;
    if (!mapping.remote_id) {
      remote = await lookup();
      if (remote) {
        if (!/^\d+$/.test(String(remote[`${singular}_id`] || ""))) throw new ZohoError("INVALID_REMOTE_MAPPING_REVIEW_REQUIRED");
        mapping = await ZohoMapping.findOneAndUpdate(key, { $set: { remote_id: String(remote[`${singular}_id`]), state: "mapped" } }, { new: true });
      }
    }
    if (mapping.remote_id) {
      if (beforeUpdate) await beforeUpdate(mapping.remote_id);
      await assertLease();
      remote = (await booksClient(connection, "PUT", `${path}/${mapping.remote_id}`, { data: payload }))[singular];
    } else {
      await assertLease();
      const claim = await ZohoMapping.updateOne({ ...key, state: "new", remote_id: { $exists: false } }, { $set: { state: "creating" } });
      if (claim.modifiedCount !== 1) throw new ZohoError("AMBIGUOUS_CREATE_REVIEW_REQUIRED");
      try {
        try {
          remote = (await booksClient(connection, "POST", path, { data: payload }))[singular];
        } catch (error) {
          if (!onCreateConflict || !(error instanceof ZohoError) || error.ambiguous || !onCreateConflict(error)) throw error;
          await assertLease();
          remote = (await booksClient(connection, "POST", path, { data: payload }))[singular];
        }
      } catch (error) {
        if (error instanceof ZohoError && !error.ambiguous) await ZohoMapping.updateOne({ ...key, state: "creating" }, { $set: { state: "new" } });
        throw error;
      }
    }
    if (!/^\d+$/.test(String(remote?.[`${singular}_id`] || ""))) throw new ZohoError("AMBIGUOUS_CREATE_REVIEW_REQUIRED");
    await ZohoMapping.updateOne(key, { $set: { remote_id: String(remote[`${singular}_id`]),
      remote_number: remote[`${singular}_number`], state: "mapped", synced_at: new Date() } });
    return remote;
  } finally { clearInterval(heartbeat); await releaseLease(lease); }
};
