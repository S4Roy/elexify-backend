import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, "/elexify_runner_integration$1");
const suite = uri ? describe : describe.skip;

// The runner's own algorithm (environment gate, dependency check, lock,
// status classification, log persistence) is what's under test here — not
// any real operation's business logic — so the registry is mocked with
// small, fully controlled fake operations instead of importing the real
// (DB/service-heavy) production entries.
const fakeOperations = new Map();
vi.mock("./seeders/registry/index.js", () => ({
  getOperation: (key) => fakeOperations.get(key),
  listOperations: () => [...fakeOperations.values()],
  hasOperation: (key) => fakeOperations.has(key),
}));

const { execute, currentEnvironment } = await import("./runner.js");
const { acquireLock } = await import("./shared/lock.js");
const { PartialExecutionError } = await import("./shared/errors.js");
const SystemOperationExecution = (await import("../models/SystemOperationExecution.js")).default;
const SystemOperationLog = (await import("../models/SystemOperationLog.js")).default;
const SystemOperationLock = (await import("../models/SystemOperationLock.js")).default;

const ENV = currentEnvironment();
const OTHER_ENV = ["development", "test", "production"].find((e) => e !== ENV);

let counter = 0;
const registerOp = (overrides = {}) => {
  counter += 1;
  const entry = {
    key: `fake-op-${counter}`,
    name: "Fake Op",
    type: "SEEDER",
    risk: "LOW",
    idempotent: true,
    dependencies: [],
    allowedEnvironments: [ENV],
    handler: async () => ({ inserted: 1, updated: 0, skipped: 0, deleted: 0, warnings: [] }),
    ...overrides,
  };
  fakeOperations.set(entry.key, entry);
  return entry;
};

suite("scripts/runner.js execute()", () => {
  beforeAll(async () => {
    await mongoose.connect(uri, { autoIndex: true });
  });

  beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
    await Promise.all([
      SystemOperationExecution.createIndexes(),
      SystemOperationLog.createIndexes(),
      SystemOperationLock.createIndexes(),
    ]);
    fakeOperations.clear();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("rejects an unknown key with OPERATION_NOT_FOUND (never resolves a free-form key to a path/command)", async () => {
    await expect(execute("../../etc/passwd", { triggerSource: "CLI" })).rejects.toMatchObject({ code: "OPERATION_NOT_FOUND" });
    await expect(execute("; rm -rf /", { triggerSource: "CLI" })).rejects.toMatchObject({ code: "OPERATION_NOT_FOUND" });
  });

  it("enforces environment restriction server-side regardless of caller", async () => {
    const op = registerOp({ allowedEnvironments: [OTHER_ENV] });
    await expect(execute(op.key, { triggerSource: "CLI" })).rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED_IN_ENVIRONMENT" });

    const execution = await SystemOperationExecution.findOne({ operation_key: op.key });
    expect(execution).toBeNull(); // rejected before an execution record was even created
  });

  it("blocks execution when a declared dependency has no prior SUCCESS in this environment", async () => {
    const dep = registerOp();
    const op = registerOp({ dependencies: [dep.key] });

    await expect(execute(op.key, { triggerSource: "CLI" })).rejects.toMatchObject({ code: "OPERATION_DEPENDENCY_NOT_SATISFIED" });

    const depOutcome = await execute(dep.key, { triggerSource: "CLI" });
    expect(depOutcome.status).toBe("SUCCESS");

    const outcome = await execute(op.key, { triggerSource: "CLI" });
    expect(outcome.status).toBe("SUCCESS");
  });

  it("blocks a second real run of a non-idempotent operation once already applied, but still allows a dry run", async () => {
    const op = registerOp({ idempotent: false, allowedEnvironments: [ENV] });

    const first = await execute(op.key, { triggerSource: "CLI" });
    expect(first.status).toBe("SUCCESS");

    await expect(execute(op.key, { triggerSource: "CLI" })).rejects.toMatchObject({ code: "OPERATION_ALREADY_APPLIED" });

    const dryRunOutcome = await execute(op.key, { triggerSource: "CLI", dryRun: true });
    expect(dryRunOutcome.status).toBe("SUCCESS");
    expect(dryRunOutcome.dryRun).toBe(true);
  });

  it("returns 409 OPERATION_ALREADY_RUNNING when the lock is already held", async () => {
    const op = registerOp();
    const held = await acquireLock(op.key, { holderId: null, executionId: null });
    expect(held).toBeTruthy();

    await expect(execute(op.key, { triggerSource: "CLI" })).rejects.toMatchObject({ code: "OPERATION_ALREADY_RUNNING", statusCode: 409 });
  });

  it("classifies a clean handler completion as SUCCESS", async () => {
    const op = registerOp({ handler: async () => ({ inserted: 3, updated: 0, skipped: 0, deleted: 0, warnings: [] }) });
    const outcome = await execute(op.key, { triggerSource: "CLI" });
    expect(outcome.status).toBe("SUCCESS");
    expect(outcome.result.inserted).toBe(3);
    expect(outcome.error).toBeNull();
  });

  it("classifies a PartialExecutionError as PARTIAL, never SUCCESS, and preserves the partial result", async () => {
    const op = registerOp({
      handler: async () => {
        throw new PartialExecutionError("wrote 4 of 10 rows then failed", { inserted: 4, updated: 0, skipped: 0, deleted: 0, warnings: [] });
      },
    });
    const outcome = await execute(op.key, { triggerSource: "CLI" });
    expect(outcome.status).toBe("PARTIAL");
    expect(outcome.result.inserted).toBe(4);
    expect(outcome.error.safe_message).toMatch(/wrote 4 of 10/);
  });

  it("classifies a hard failure before any progress as FAILED with a safe error, never a raw stack trace", async () => {
    const op = registerOp({
      handler: async () => {
        throw new Error("connection string was mongodb://admin:hunter2@host/db — boom");
      },
    });
    const outcome = await execute(op.key, { triggerSource: "CLI" });
    expect(outcome.status).toBe("FAILED");
    expect(outcome.result).toBeNull();
    expect(outcome.error.safe_message).not.toContain("hunter2");
    expect(outcome.error.safe_message).not.toContain("stack");
  });

  it("releases the lock in a finally block regardless of success or failure", async () => {
    const successOp = registerOp();
    await execute(successOp.key, { triggerSource: "CLI" });
    const lockAfterSuccess = await SystemOperationLock.findOne({ operation_key: successOp.key });
    expect(lockAfterSuccess.locked).toBe(false);

    const failOp = registerOp({
      handler: async () => {
        throw new Error("boom");
      },
    });
    await execute(failOp.key, { triggerSource: "CLI" });
    const lockAfterFailure = await SystemOperationLock.findOne({ operation_key: failOp.key });
    expect(lockAfterFailure.locked).toBe(false);
  });

  it("redacts a secret-shaped log message before it is ever persisted", async () => {
    const op = registerOp({
      handler: async (context) => {
        context.logger.info("Using password: SuperSecret123 to connect");
        return { inserted: 1, updated: 0, skipped: 0, deleted: 0, warnings: [] };
      },
    });
    const outcome = await execute(op.key, { triggerSource: "CLI" });
    const logs = await SystemOperationLog.find({ execution_id: outcome.executionId }).lean();
    const allMessages = logs.map((l) => l.message).join("\n");
    expect(allMessages).not.toContain("SuperSecret123");
  });

  it("caps persisted log lines and appends a truncation warning rather than growing unbounded", async () => {
    const op = registerOp({
      handler: async (context) => {
        for (let i = 0; i < 600; i += 1) context.logger.info(`line ${i}`);
        return { inserted: 0, updated: 0, skipped: 0, deleted: 0, warnings: [] };
      },
    });
    const outcome = await execute(op.key, { triggerSource: "CLI" });
    const logs = await SystemOperationLog.find({ execution_id: outcome.executionId }).sort({ timestamp: 1 }).lean();
    expect(logs.length).toBe(500);
    expect(logs[logs.length - 1].message).toMatch(/truncated/i);

    const execution = await SystemOperationExecution.findById(outcome.executionId).lean();
    expect(execution.log_truncated).toBe(true);
    expect(execution.log_line_count).toBe(500);
  });

  it("records started_at/completed_at/duration_ms on every execution", async () => {
    const op = registerOp();
    const outcome = await execute(op.key, { triggerSource: "CLI" });
    const execution = await SystemOperationExecution.findById(outcome.executionId).lean();
    expect(execution.started_at).toBeTruthy();
    expect(execution.completed_at).toBeTruthy();
    expect(execution.duration_ms).toBeGreaterThanOrEqual(0);
  });
});
