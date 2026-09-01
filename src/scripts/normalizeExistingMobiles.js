/**
 * One-time cleanup: strips "+"/country-code prefix and whitespace from
 * every stored mobile value so the same number can't exist in multiple
 * string forms (e.g. "+916376279486" vs "916376279486" vs "6376279486").
 *
 * Run this BEFORE re-checking duplicates / rebuilding the unique index,
 * since normalization can surface new collisions that weren't visible
 * as exact-string duplicates before.
 *
 * Usage:
 *   node src/scripts/normalizeExistingMobiles.js            # dry run
 *   node src/scripts/normalizeExistingMobiles.js --apply     # write changes
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import User from "../models/User.js";
import { normalizeMobile } from "../helpers/mobileHelper.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

export const runNormalizeExistingMobiles = async ({ apply = false, logger = createLogger() } = {}) => {
  const users = await User.find({ mobile: { $type: "string" } })
    .select("_id name phone_code mobile")
    .lean();

  logger.info(`Checked ${users.length} users with a mobile number.`);
  logger.info(apply ? "APPLY MODE — writing changes" : "DRY RUN — no changes");

  let changed = 0;
  let invalid = 0;

  for (const user of users) {
    const phoneCode = user.phone_code || "91";
    const normalized = normalizeMobile(user.mobile, phoneCode);

    if (normalized === null) {
      invalid += 1;
      logger.warn(`INVALID ${user._id} phone_code=${phoneCode} — could not normalize, needs manual review`);
      continue;
    }

    if (normalized !== user.mobile) {
      changed += 1;
      logger.info(`FIX ${user._id}: normalized mobile value`);
      if (apply) {
        await User.updateOne(
          { _id: user._id },
          { $set: { mobile: normalized } },
        );
      }
    }
  }

  logger.info(`${apply ? "Fixed" : "Would fix"} ${changed} mobile value(s). ${invalid} could not be normalized (manual review needed).`);

  return {
    logs: logger.logs,
    summary: { checked: users.length, changed, invalid, applied: apply },
    result: apply
      ? buildResult({ updated: changed, warnings: invalid ? [`${invalid} mobile value(s) need manual review`] : [] })
      : buildResult({ warnings: [`Dry run: would fix ${changed} mobile value(s), ${invalid} need manual review`] }),
    dryRunPreview: !apply ? { wouldInsert: 0, wouldUpdate: changed, wouldSkip: invalid, wouldDelete: 0 } : null,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const apply = process.argv.includes("--apply");
    const { logs } = await runNormalizeExistingMobiles({ apply });
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
