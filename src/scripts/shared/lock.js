// Mongo compare-and-swap lock for SystemOperationLock — DB-backed so it
// works across multiple backend instances, unlike an in-memory mutex.
//
// acquireLock(key, {holderId}) succeeds (returns the lock doc) when the
// document is currently unlocked, doesn't exist yet, or its heartbeat is
// older than LOCK_STALE_MS (a crashed process never released it). It fails
// (returns null) when someone else holds a live lock — callers should
// treat that as 409 OPERATION_ALREADY_RUNNING.
import SystemOperationLock from "../../models/SystemOperationLock.js";

export const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes

export const acquireLock = async (operationKey, { holderId, executionId }) => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_STALE_MS);

  const acquired = await SystemOperationLock.findOneAndUpdate(
    {
      operation_key: operationKey,
      $or: [
        { locked: { $ne: true } },
        { locked_at: { $lt: staleBefore } },
        { heartbeat_at: { $lt: staleBefore } },
      ],
    },
    {
      $set: {
        operation_key: operationKey,
        locked: true,
        locked_at: now,
        heartbeat_at: now,
        holder_id: holderId || null,
        execution_id: executionId || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(async (error) => {
    // A concurrent upsert racing on the unique operation_key index throws
    // E11000 instead of returning null — treat that identically to "lock
    // held by someone else" rather than surfacing a raw duplicate-key error.
    if (error?.code === 11000) return null;
    throw error;
  });

  return acquired;
};

// Stamps the real execution id onto a lock this caller already holds (i.e.
// right after a successful acquireLock() with executionId still unknown/
// null). Deliberately NOT run through the CAS filter — the caller already
// proved sole ownership by winning acquireLock(), and a fresh lock's own
// heartiest/locked_at would otherwise make a second CAS attempt fail
// against itself.
export const stampLockExecutionId = async (operationKey, executionId) => {
  await SystemOperationLock.updateOne(
    { operation_key: operationKey, locked: true },
    { $set: { execution_id: executionId } },
  );
};

export const releaseLock = async (operationKey, executionId) => {
  await SystemOperationLock.updateOne(
    { operation_key: operationKey, execution_id: executionId },
    { $set: { locked: false, heartbeat_at: new Date() }, $unset: { holder_id: "", execution_id: "" } },
  );
};

export const heartbeatLock = async (operationKey, executionId) => {
  await SystemOperationLock.updateOne(
    { operation_key: operationKey, execution_id: executionId, locked: true },
    { $set: { heartbeat_at: new Date() } },
  );
};
