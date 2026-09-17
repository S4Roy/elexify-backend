/**
 * One-time backfill: sets mobile_verified_at on existing active users who
 * have never gone through the OTP flow but have placed at least one real
 * order — the strongest available proof they're a legitimate customer
 * (there is no login-history field on User to use as a second signal).
 *
 * Context: mobile_verified_at is only set by the OTP login/signup and
 * mobile-change flows (see controllers/auth/verifyUserOtp.js,
 * controllers/user/account/verifyMobileChange.js). Those flows are newer
 * than most of this store's user base, so ~99% of active users show
 * mobile_verified_at: null today — not because they're untrustworthy,
 * just because the feature postdates their signup. Left as null, that
 * skews any future policy that treats "verified" as a trust signal (e.g.
 * dedupe-user-mobiles's survivor selection) against real, long-standing
 * customers who simply never happened to re-verify.
 *
 * Deliberately NOT a blanket "every pre-OTP user is verified" backfill —
 * only users with a real Order attached get the flag. mobile_verified_at
 * is set to the user's EARLIEST order's created_at, not "now": it's a
 * historical fact being recorded, not a verification happening today.
 *
 * Usage:
 *   node src/scripts/backfillVerifiedMobileForOrderedUsers.js            # dry run
 *   node src/scripts/backfillVerifiedMobileForOrderedUsers.js --apply     # write changes
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

export const runBackfillVerifiedMobileForOrderedUsers = async ({ apply = false, logger = createLogger() } = {}) => {
  const candidates = await User.find({
    mobile: { $type: "string" },
    deleted_at: null,
    mobile_verified_at: null,
  })
    .select("_id name mobile")
    .lean();

  logger.info(`Checked ${candidates.length} active user(s) with an unverified mobile.`);
  logger.info(apply ? "APPLY MODE — writing changes" : "DRY RUN — no changes");

  if (!candidates.length) {
    logger.info("Nothing to backfill.");
    return {
      logs: logger.logs,
      summary: { checked: 0, fixed: 0, applied: apply },
      result: buildResult({}),
      dryRunPreview: !apply ? { wouldInsert: 0, wouldUpdate: 0, wouldSkip: 0, wouldDelete: 0 } : null,
    };
  }

  const candidateIds = candidates.map((u) => u._id);
  const earliestOrderByUser = await Order.aggregate([
    { $match: { user: { $in: candidateIds } } },
    { $sort: { created_at: 1 } },
    { $group: { _id: "$user", earliest_order_at: { $first: "$created_at" } } },
  ]);
  const earliestOrderAtById = new Map(earliestOrderByUser.map((row) => [String(row._id), row.earliest_order_at]));

  let fixed = 0;

  for (const user of candidates) {
    const earliestOrderAt = earliestOrderAtById.get(String(user._id));
    if (!earliestOrderAt) continue; // no order on record — not our signal to act on

    fixed += 1;
    logger.info(`FIX ${user._id}: mobile_verified_at -> ${new Date(earliestOrderAt).toISOString()} (has order history)`);
    if (apply) {
      await User.updateOne(
        { _id: user._id },
        { $set: { mobile_verified_at: earliestOrderAt } },
      );
    }
  }

  logger.info(`${apply ? "Fixed" : "Would fix"} ${fixed} of ${candidates.length} unverified user(s) with order history.`);

  return {
    logs: logger.logs,
    summary: { checked: candidates.length, fixed, applied: apply },
    result: apply
      ? buildResult({ updated: fixed })
      : buildResult({ warnings: [`Dry run: would fix ${fixed} account(s)`] }),
    dryRunPreview: !apply ? { wouldInsert: 0, wouldUpdate: fixed, wouldSkip: candidates.length - fixed, wouldDelete: 0 } : null,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const apply = process.argv.includes("--apply");
    const { logs } = await runBackfillVerifiedMobileForOrderedUsers({ apply });
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
