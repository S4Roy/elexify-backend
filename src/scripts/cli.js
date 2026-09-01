// Unified CLI for the data-operations registry — `list`, `status`,
// `run <key>`, `dry-run <key>`, all going through the exact same
// runner.execute() the admin API calls (triggerSource: "CLI"). Exit code 0
// on SUCCESS, non-zero on FAILED/PARTIAL/error, for CI use.
//
// Usage:
//   node src/scripts/cli.js list
//   node src/scripts/cli.js status [key]
//   node src/scripts/cli.js run <key>
//   node src/scripts/cli.js dry-run <key>
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import { listOperations, getOperation } from "./seeders/registry/index.js";
import { execute, currentEnvironment } from "./runner.js";
import SystemOperationExecution from "../models/SystemOperationExecution.js";
import SystemOperationLog from "../models/SystemOperationLog.js";

const printTable = (rows) => {
  for (const row of rows) console.log(row);
};

const cmdList = async () => {
  const environment = currentEnvironment();
  printTable(
    listOperations().map((entry) => {
      const allowed = entry.allowedEnvironments.includes(environment) ? "allowed" : "blocked-here";
      return `${entry.key.padEnd(32)} ${entry.type.padEnd(10)} risk=${entry.risk.padEnd(8)} required=${String(entry.required).padEnd(5)} idempotent=${String(entry.idempotent).padEnd(5)} [${allowed}]`;
    }),
  );
  return 0;
};

const cmdStatus = async (key) => {
  const environment = currentEnvironment();
  const keys = key ? [key] : listOperations().map((e) => e.key);
  for (const opKey of keys) {
    const entry = getOperation(opKey);
    if (!entry) {
      console.log(`${opKey}: OPERATION_NOT_FOUND`);
      continue;
    }
    const lastExecution = await SystemOperationExecution.findOne({ operation_key: opKey, environment })
      .sort({ created_at: -1 })
      .lean();
    let healthLine = "health=NOT_APPLICABLE";
    if (entry.healthCheck) {
      try {
        const health = await entry.healthCheck({ environment });
        healthLine = `health=${health.status} (${health.actual}/${health.expected})`;
      } catch (e) {
        healthLine = `health=ERROR(${e.message})`;
      }
    }
    const lastLine = lastExecution
      ? `last=${lastExecution.status}@${lastExecution.created_at.toISOString()}`
      : "last=NEVER_RUN";
    console.log(`${opKey.padEnd(32)} ${lastLine.padEnd(40)} ${healthLine}`);
  }
  return 0;
};

const printExecutionLogs = async (executionId) => {
  const logs = await SystemOperationLog.find({ execution_id: executionId }).sort({ timestamp: 1 }).lean();
  for (const line of logs) console.log(`[${line.timestamp.toISOString()}] [${line.level}] ${line.message}`);
};

const cmdRun = async (key, { dryRun }) => {
  if (!key) {
    console.error(`Usage: node src/scripts/cli.js ${dryRun ? "dry-run" : "run"} <key>`);
    return 1;
  }
  try {
    const outcome = await execute(key, { dryRun, triggerSource: "CLI" });
    await printExecutionLogs(outcome.executionId);
    console.log(`\n[${key}] status=${outcome.status} dryRun=${outcome.dryRun} environment=${outcome.environment}`);
    console.log(`[${key}] result: ${JSON.stringify(outcome.result)}`);
    if (outcome.error) console.error(`[${key}] error: ${JSON.stringify(outcome.error)}`);
    if (outcome.status === "SUCCESS") return 0;
    return 1; // FAILED or PARTIAL — non-zero for CI use
  } catch (error) {
    console.error(`[${key}] ${error.code || "ERROR"}: ${error.message}`);
    return 1;
  }
};

const main = async () => {
  const [, , command, key] = process.argv;
  await mongooseConnection;

  let exitCode = 0;
  switch (command) {
    case "list":
      exitCode = await cmdList();
      break;
    case "status":
      exitCode = await cmdStatus(key);
      break;
    case "run":
      exitCode = await cmdRun(key, { dryRun: false });
      break;
    case "dry-run":
      exitCode = await cmdRun(key, { dryRun: true });
      break;
    default:
      console.error("Usage: node src/scripts/cli.js <list|status|run|dry-run> [key]");
      exitCode = 1;
  }

  await mongoose.disconnect();
  process.exit(exitCode);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
