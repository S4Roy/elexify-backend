import mongoose, { mongooseConnection } from "../config/mongoose.js";
import User from "../models/User.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

export const runFixUserIndexes = async ({ logger = createLogger() } = {}) => {
  const users = mongoose.connection.collection("users");
  const existing = await users.indexes();
  const names = existing.map((i) => i.name);

  let dropped = 0;
  if (names.includes("email_1")) {
    await users.dropIndex("email_1");
    dropped += 1;
    logger.info("Dropped email_1");
  }
  if (names.includes("phone_code_1_mobile_1")) {
    await users.dropIndex("phone_code_1_mobile_1");
    dropped += 1;
    logger.info("Dropped phone_code_1_mobile_1");
  }

  await User.syncIndexes();
  logger.info("Synced new partial indexes");

  return { logs: logger.logs, summary: { dropped }, result: buildResult({ deleted: dropped }) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const { logs } = await runFixUserIndexes();
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
