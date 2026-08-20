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
import mongoose from "../config/mongoose.js";
import User from "../models/User.js";

const APPLY = process.argv.includes("--apply");

const run = async () => {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once("open", resolve);
      mongoose.connection.once("error", reject);
    });
  }

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

  console.log(
    `Found ${dupeGroups.length} duplicate (phone_code, mobile) groups.`,
  );
  console.log(
    APPLY
      ? "APPLY MODE — writing changes"
      : "DRY RUN — no changes will be written (pass --apply to write)",
  );
  console.log("");

  let totalTagged = 0;

  for (const group of dupeGroups) {
    const { phone_code, mobile } = group._id;
    const sorted = [...group.docs].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );
    const keep = sorted[0];
    const dupes = sorted.slice(1);

    console.log(`${phone_code} ${mobile}:`);
    console.log(
      `  KEEP   ${keep._id}  "${keep.name}"  created ${keep.created_at}`,
    );

    for (const dupe of dupes) {
      console.log(
        `  TAG    ${dupe._id}  "${dupe.name}"  created ${dupe.created_at}`,
      );
      totalTagged += 1;

      if (APPLY) {
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
    console.log("");
  }

  console.log(
    `${APPLY ? "Tagged" : "Would tag"} ${totalTagged} duplicate account(s).`,
  );
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
