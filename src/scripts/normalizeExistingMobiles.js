/**
 * One-time cleanup: strips "+"/country-code prefix and whitespace from
 * every stored mobile value so the same number can't exist in multiple
 * string forms (e.g. "+916376279486" vs "916376279308" vs "6376279486"),
 * and backfills a missing/null `phone_code` to the default once a mobile
 * successfully normalizes.
 *
 * The phone_code backfill matters as much as the mobile rewrite: the
 * unique (phone_code, mobile) partial index only applies to documents
 * where BOTH fields are strings (see User.js), so a user stored with
 * phone_code: null is invisible to the index and to
 * dedupe-user-mobiles's matching *no matter how clean their mobile
 * value is* — on this dataset, ~every phone_code was either "91" or
 * null, so defaulting null to DEFAULT_PHONE_CODE is safe here.
 *
 * Run this BEFORE re-checking duplicates / rebuilding the unique index,
 * since normalization can surface new collisions that weren't visible
 * as exact-string duplicates before. (dedupe-user-mobiles now also
 * matches on the normalized value directly, so it no longer strictly
 * depends on this having run first — but running it first still means
 * fewer accounts end up in a "duplicate, tagged" state vs. a clean
 * "already canonical" one.)
 *
 * Usage:
 *   node src/scripts/normalizeExistingMobiles.js            # dry run
 *   node src/scripts/normalizeExistingMobiles.js --apply     # write changes
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import User from "../models/User.js";
import { normalizeMobile, DEFAULT_PHONE_CODE } from "../helpers/mobileHelper.js";
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
    const phoneCode = user.phone_code || DEFAULT_PHONE_CODE;
    const normalized = normalizeMobile(user.mobile, phoneCode);

    if (normalized === null) {
      invalid += 1;
      logger.warn(`INVALID ${user._id} phone_code=${user.phone_code ?? "null"} mobile="${user.mobile}" — could not normalize, needs manual review`);
      continue;
    }

    const mobileNeedsFix = normalized !== user.mobile;
    const phoneCodeNeedsFix = (user.phone_code || null) !== phoneCode;
    if (mobileNeedsFix || phoneCodeNeedsFix) {
      changed += 1;
      logger.info(`FIX ${user._id}: mobile "${user.mobile}" -> "${normalized}", phone_code ${user.phone_code ?? "null"} -> ${phoneCode}`);
      if (apply) {
        await User.updateOne(
          { _id: user._id },
          { $set: { mobile: normalized, phone_code: phoneCode } },
        );
      }
    }
  }

  logger.info(`${apply ? "Fixed" : "Would fix"} ${changed} account(s). ${invalid} could not be normalized (manual review needed).`);

  return {
    logs: logger.logs,
    summary: { checked: users.length, changed, invalid, applied: apply },
    result: apply
      ? buildResult({ updated: changed, warnings: invalid ? [`${invalid} mobile value(s) need manual review`] : [] })
      : buildResult({ warnings: [`Dry run: would fix ${changed} account(s), ${invalid} need manual review`] }),
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
