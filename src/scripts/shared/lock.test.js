import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, "/elexify_lock_integration$1");
const suite = uri ? describe : describe.skip;

const { acquireLock, releaseLock, LOCK_STALE_MS } = await import("./lock.js");
const SystemOperationLock = (await import("../../models/SystemOperationLock.js")).default;

suite("shared/lock.js — SystemOperationLock CAS behavior", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await SystemOperationLock.createIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("acquires a lock on a never-locked key", async () => {
    const lock = await acquireLock("op-a", { holderId: null, executionId: null });
    expect(lock).toBeTruthy();
    expect(lock.locked).toBe(true);
  });

  it("rejects a concurrent acquire while the lock is held (simulates 409 OPERATION_ALREADY_RUNNING)", async () => {
    const first = await acquireLock("op-b", { holderId: null, executionId: null });
    expect(first).toBeTruthy();

    const second = await acquireLock("op-b", { holderId: null, executionId: null });
    expect(second).toBeNull();
  });

  it("allows re-acquire after release", async () => {
    const executionId1 = new mongoose.Types.ObjectId();
    const executionId2 = new mongoose.Types.ObjectId();
    await acquireLock("op-c", { holderId: null, executionId: executionId1 });
    await releaseLock("op-c", executionId1);

    const reacquired = await acquireLock("op-c", { holderId: null, executionId: executionId2 });
    expect(reacquired).toBeTruthy();
  });

  it("reclaims a stale lock (heartbeat older than the stale threshold) instead of blocking forever", async () => {
    const staleTimestamp = new Date(Date.now() - LOCK_STALE_MS - 60_000);
    await SystemOperationLock.create({
      operation_key: "op-d",
      locked: true,
      locked_at: staleTimestamp,
      heartbeat_at: staleTimestamp,
      holder_id: null,
      execution_id: null,
    });

    const reclaimed = await acquireLock("op-d", { holderId: null, executionId: null });
    expect(reclaimed).toBeTruthy();
    expect(reclaimed.locked).toBe(true);
  });

  it("does NOT reclaim a lock with a fresh heartbeat", async () => {
    await SystemOperationLock.create({
      operation_key: "op-e",
      locked: true,
      locked_at: new Date(),
      heartbeat_at: new Date(),
      holder_id: null,
      execution_id: null,
    });

    const blocked = await acquireLock("op-e", { holderId: null, executionId: null });
    expect(blocked).toBeNull();
  });

  it("locks on different keys never contend with each other", async () => {
    const a = await acquireLock("op-f-1", { holderId: null, executionId: null });
    const b = await acquireLock("op-f-2", { holderId: null, executionId: null });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });
});
