/**
 * Resolves duplicate active users so the unique (phone_code, mobile)
 * partial index can build.
 *
 * Duplicates are matched on the NORMALIZED mobile value (see
 * ../helpers/mobileHelper.js), not the raw stored string — the same
 * number stored as "+919992065728", "919992065728", and "9992065728"
 * is one duplicate group, not three distinct ones. This makes the
 * operation correct standalone, regardless of whether
 * normalize-existing-mobiles has already run: grouping on the raw
 * string alone (the previous behavior) reported 0 duplicates on this
 * dataset while 156 real groups existed in different string forms.
 * A raw string is used as the grouping key only as a fallback, for
 * values that can't be normalized (e.g. two numbers jammed into one
 * field) — those still get caught if truly byte-identical.
 *
 * Policy: within a group, prefer an OTP-verified account
 * (mobile_verified_at set) over an unverified one, and only fall back
 * to OLDEST (earliest created_at) to break ties. Ignoring verification
 * and going by age alone is wrong here: on this dataset it would have
 * kept an older, never-verified stub account as canonical and tagged
 * away a newer account the real customer actually completed OTP
 * verification on — locking them out of the account they can prove
 * they own. If the group matched via normalization,
 * the survivor's mobile/phone_code are also rewritten to the
 * normalized canonical form (so the survivor itself doesn't block the
 * unique index). Every newer duplicate is soft-tagged:
 *   - deleted_at set to now
 *   - mobile suffixed with "_dup_<_id>" so it no longer collides
 * No documents are deleted, no orders/carts/etc. are touched or
 * reassigned. This is reversible: clear deleted_at and strip the
 * "_dup_<_id>" suffix from mobile to restore a tagged account (the
 * survivor's canonicalization is also just a mobile/phone_code value,
 * recoverable from the account's own history if ever needed).
 *
 * Write order within a group matters: duplicates are tagged away FIRST,
 * survivor canonicalization happens AFTER. The unique (phone_code,
 * mobile) partial index is live and exact-string, so if e.g. one dupe
 * already happens to hold the group's canonical value verbatim (just
 * hasn't been through normalize yet), canonicalizing the survivor into
 * that same value *before* the dupe is tagged away throws E11000 —
 * canonicalizing after clears that value out of the collection first.
 *
 * Usage:
 *   node src/scripts/dedupeUserMobiles.js            # dry run, prints plan only
 *   node src/scripts/dedupeUserMobiles.js --apply     # actually writes changes
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import User from "../models/User.js";
import { normalizeMobile, DEFAULT_PHONE_CODE } from "../helpers/mobileHelper.js";
import { createLogger } from "./shared/logger.js";
import { buildResult } from "./shared/result.js";

// apply=false performs the same read/plan phase with zero writes — this is
// the dry-run preview the data-operations registry entry uses (see
// seeders/registry/operations/dedupe-user-mobiles.js), not a separate
// reimplementation.
export const runDedupeUserMobiles = async ({ apply = false, logger = createLogger() } = {}) => {
  const users = await User.find({ mobile: { $type: "string" }, deleted_at: null })
    .select("_id name phone_code mobile created_at mobile_verified_at")
    .lean();

  const groups = new Map();
  for (const user of users) {
    const rawPhoneCode = user.phone_code || DEFAULT_PHONE_CODE;
    const normalizedMobile = normalizeMobile(user.mobile, rawPhoneCode);
    const matched = normalizedMobile !== null;
    // Prefixing keeps normalized-match keys and raw-fallback keys in
    // disjoint namespaces, so a garbage string can never accidentally
    // collide with an unrelated normalized number.
    const key = matched
      ? `norm:${rawPhoneCode}:${normalizedMobile}`
      : `raw:${user.phone_code ?? "null"}:${user.mobile}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...user, matched, canonicalPhoneCode: rawPhoneCode, canonicalMobile: matched ? normalizedMobile : user.mobile });
  }

  const dupeGroups = [...groups.values()].filter((docs) => docs.length > 1);

  logger.info(`Found ${dupeGroups.length} duplicate (phone_code, mobile) groups (matched on normalized value).`);
  logger.info(apply ? "APPLY MODE — writing changes" : "DRY RUN — no changes will be written");

  let totalTagged = 0;
  let survivorsCanonicalized = 0;

  for (const group of dupeGroups) {
    const sorted = [...group].sort((a, b) => {
      const verifiedDiff = Number(!!b.mobile_verified_at) - Number(!!a.mobile_verified_at);
      if (verifiedDiff !== 0) return verifiedDiff;
      return new Date(a.created_at) - new Date(b.created_at);
    });
    const keep = sorted[0];
    const dupes = sorted.slice(1);

    logger.info(`${keep.canonicalPhoneCode} ${keep.canonicalMobile}: KEEP ${keep._id} created ${keep.created_at} verified=${!!keep.mobile_verified_at}`);

    // Tag duplicates away FIRST — see the write-order note above. A tag
    // write can never collide (the suffixed value is unique per _id), so
    // this is always safe regardless of what the survivor currently holds.
    for (const dupe of dupes) {
      logger.info(`${keep.canonicalPhoneCode} ${keep.canonicalMobile}: TAG ${dupe._id} created ${dupe.created_at} verified=${!!dupe.mobile_verified_at} (raw mobile="${dupe.mobile}")`);
      totalTagged += 1;

      if (apply) {
        try {
          await User.updateOne(
            { _id: dupe._id },
            {
              $set: {
                deleted_at: new Date(),
                mobile: `${dupe.mobile}_dup_${dupe._id}`,
              },
            },
          );
        } catch (error) {
          if (error?.code !== 11000) throw error;
          logger.error(`${keep.canonicalPhoneCode} ${keep.canonicalMobile}: FAILED to tag ${dupe._id} — unexpected duplicate key, skipped: ${error.message}`);
        }
      }
    }

    // The survivor may still hold the un-normalized raw string (e.g. dedupe
    // ran before normalize-existing-mobiles) — canonicalize it too, so the
    // group is actually resolved and the unique index can build on it.
    const survivorNeedsFix = keep.matched
      && (keep.mobile !== keep.canonicalMobile || (keep.phone_code || null) !== keep.canonicalPhoneCode);
    if (survivorNeedsFix) {
      logger.info(`${keep.canonicalPhoneCode} ${keep.canonicalMobile}: CANONICALIZE survivor ${keep._id} (was phone_code=${keep.phone_code} mobile="${keep.mobile}")`);
      survivorsCanonicalized += 1;
      if (apply) {
        try {
          await User.updateOne(
            { _id: keep._id },
            { $set: { mobile: keep.canonicalMobile, phone_code: keep.canonicalPhoneCode } },
          );
        } catch (error) {
          if (error?.code !== 11000) throw error;
          logger.error(`${keep.canonicalPhoneCode} ${keep.canonicalMobile}: FAILED to canonicalize survivor ${keep._id} — unexpected duplicate key, skipped: ${error.message}`);
        }
      }
    }
  }

  logger.info(`${apply ? "Tagged" : "Would tag"} ${totalTagged} duplicate account(s); ${apply ? "canonicalized" : "would canonicalize"} ${survivorsCanonicalized} survivor(s).`);

  return {
    logs: logger.logs,
    summary: { groups: dupeGroups.length, tagged: totalTagged, canonicalized: survivorsCanonicalized, applied: apply },
    result: apply
      ? buildResult({ updated: totalTagged + survivorsCanonicalized })
      : buildResult({ warnings: [`Dry run: would tag ${totalTagged} duplicate account(s), canonicalize ${survivorsCanonicalized} survivor(s)`] }),
    dryRunPreview: !apply ? { wouldInsert: 0, wouldUpdate: totalTagged + survivorsCanonicalized, wouldSkip: 0, wouldDelete: 0 } : null,
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
