/**
 * One-time backfill: sets email_verified_at on existing active users who
 * have never gone through the OTP flow but have placed at least one real
 * order — the strongest available proof they're a legitimate customer
 * (there is no login-history field on User to use as a second signal).
 *
 * Same rationale as backfillVerifiedMobileForOrderedUsers.js, mirrored
 * for the email side. Context: email_verified_at is only set by the OTP
 * login/signup and email-change flows (see controllers/auth/verifyUserOtp.js,
 * controllers/user/account/verifyEmailChange.js). Those flows are newer
 * than most of this store's user base, so ~99% of active users show
 * email_verified_at: null today — not because they're untrustworthy,
 * just because the feature postdates their signup.
 *
 * Deliberately NOT a blanket "every pre-OTP user is verified" backfill —
 * only users with a real Order attached get the flag. email_verified_at
 * is set to the user's EARLIEST order's created_at, not "now": it's a
 * historical fact being recorded, not a verification happening today.
 *
 * Usage:
 *   node src/scripts/backfillVerifiedEmailForOrderedUsers.js            # dry run
 *   node src/scripts/backfillVerifiedEmailForOrderedUsers.js --apply     # write changes
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

export const runBackfillVerifiedEmailForOrderedUsers = async ({ apply = false, logger = createLogger() } = {}) => {
  const candidates = await User.find({
    email: { $type: "string" },
    deleted_at: null,
    email_verified_at: null,
  })
    .select("_id name email")
    .lean();

  logger.info(`Checked ${candidates.length} active user(s) with an unverified email.`);
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
    logger.info(`FIX ${user._id}: email_verified_at -> ${new Date(earliestOrderAt).toISOString()} (has order history)`);
    if (apply) {
      await User.updateOne(
        { _id: user._id },
        { $set: { email_verified_at: earliestOrderAt } },
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
    const { logs } = await runBackfillVerifiedEmailForOrderedUsers({ apply });
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
