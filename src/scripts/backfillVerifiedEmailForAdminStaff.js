/**
 * One-time backfill: sets email_verified_at on existing admin/staff
 * accounts (admin_role_id set) that predate this field being enforced.
 *
 * Context: sendNotification() only enqueues the email channel for a
 * verified address (see services/notification/sendNotification.js). Staff
 * accounts created via POST /admin/role/staff before that check existed —
 * and before routes/admin/role.js started stamping email_verified_at at
 * creation time — never got the field set, so every security email
 * (password change, forgot-password reset, account lockout) is silently
 * dropped for them with no error logged anywhere.
 *
 * These addresses were entered by a superadmin at account-creation time,
 * not self-registered — same trust basis as the fix in role.js — so
 * backfilling them to "verified now" is consistent, not a weakening of the
 * check.
 *
 * Usage:
 *   node src/scripts/backfillVerifiedEmailForAdminStaff.js            # dry run
 *   node src/scripts/backfillVerifiedEmailForAdminStaff.js --apply     # write changes
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import User from "../models/User.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

export const runBackfillVerifiedEmailForAdminStaff = async ({ apply = false, logger = createLogger() } = {}) => {
  const candidates = await User.find({
    admin_role_id: { $ne: null },
    deleted_at: null,
    email_verified_at: null,
  })
    .select("_id name email")
    .lean();

  logger.info(`Checked ${candidates.length} admin/staff account(s) with an unverified email.`);
  logger.info(apply ? "APPLY MODE — writing changes" : "DRY RUN — no changes");

  for (const user of candidates) {
    logger.info(`${apply ? "FIX" : "Would fix"} ${user._id} (${user.email})`);
  }

  if (apply && candidates.length) {
    await User.updateMany(
      { _id: { $in: candidates.map((u) => u._id) } },
      { $set: { email_verified_at: new Date() } },
    );
  }

  logger.info(`${apply ? "Fixed" : "Would fix"} ${candidates.length} admin/staff account(s).`);

  return {
    logs: logger.logs,
    summary: { checked: candidates.length, fixed: candidates.length, applied: apply },
    result: apply
      ? buildResult({ updated: candidates.length })
      : buildResult({ warnings: [`Dry run: would fix ${candidates.length} account(s)`] }),
    dryRunPreview: !apply
      ? { wouldInsert: 0, wouldUpdate: candidates.length, wouldSkip: 0, wouldDelete: 0 }
      : null,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const apply = process.argv.includes("--apply");
    const { logs } = await runBackfillVerifiedEmailForAdminStaff({ apply });
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
