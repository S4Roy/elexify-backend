/**
 * Resolves duplicate (phone_code, mobile) active users so the unique
 * partial index can build.
 *
 * Policy: keep the OLDEST (earliest created_at) account per duplicate
 * group as canonical/active. Every newer duplicate is soft-tagged:
 *   - deleted_at set to now
 *   - mobile suffixed with "_dup_<_id>" so it no longer collides
 * No documents are deleted, no orders/carts/etc. are touched or
 * reassigned. This is reversible: clear deleted_at and strip the
 * "_dup_<_id>" suffix from mobile to restore a tagged account.
 *
 * Usage:
 *   node src/scripts/dedupeUserMobiles.js            # dry run, prints plan only
 *   node src/scripts/dedupeUserMobiles.js --apply     # actually writes changes
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import User from "../models/User.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

// apply=false performs the same read/plan phase with zero writes — this is
// the dry-run preview the data-operations registry entry uses (see
// seeders/registry/operations/dedupe-user-mobiles.js), not a separate
// reimplementation.
export const runDedupeUserMobiles = async ({ apply = false, logger = createLogger() } = {}) => {
  const dupeGroups = await User.aggregate([
    {
      $match: {
        mobile: { $type: "string" },
        phone_code: { $type: "string" },
        deleted_at: null,
      },
    },
    {
      $group: {
        _id: { phone_code: "$phone_code", mobile: "$mobile" },
        count: { $sum: 1 },
        docs: {
          $push: { _id: "$_id", created_at: "$created_at", name: "$name" },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  logger.info(`Found ${dupeGroups.length} duplicate (phone_code, mobile) groups.`);
  logger.info(apply ? "APPLY MODE — writing changes" : "DRY RUN — no changes will be written");

  let totalTagged = 0;

  for (const group of dupeGroups) {
    const { phone_code, mobile } = group._id;
    const sorted = [...group.docs].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );
    const keep = sorted[0];
    const dupes = sorted.slice(1);

    logger.info(`${phone_code} ${mobile}: KEEP ${keep._id} created ${keep.created_at}`);

    for (const dupe of dupes) {
      logger.info(`${phone_code} ${mobile}: TAG ${dupe._id} created ${dupe.created_at}`);
      totalTagged += 1;

      if (apply) {
        await User.updateOne(
          { _id: dupe._id },
          {
            $set: {
              deleted_at: new Date(),
              mobile: `${mobile}_dup_${dupe._id}`,
            },
          },
        );
      }
    }
  }

  logger.info(`${apply ? "Tagged" : "Would tag"} ${totalTagged} duplicate account(s).`);

  return {
    logs: logger.logs,
    summary: { groups: dupeGroups.length, tagged: totalTagged, applied: apply },
    result: apply
      ? buildResult({ updated: totalTagged })
      : buildResult({ warnings: [`Dry run: would tag ${totalTagged} duplicate account(s)`] }),
    dryRunPreview: !apply ? { wouldInsert: 0, wouldUpdate: totalTagged, wouldSkip: 0, wouldDelete: 0 } : null,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = async () => {
    await mongooseConnection;
    const apply = process.argv.includes("--apply");
    const { logs } = await runDedupeUserMobiles({ apply });
    for (const { timestamp, level, message } of logs) console.log(`[${timestamp}] [${level}] ${message}`);
    await mongoose.disconnect();
    process.exit(0);
  };
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
