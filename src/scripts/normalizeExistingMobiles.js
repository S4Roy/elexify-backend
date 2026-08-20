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
import mongoose from "../config/mongoose.js";
import User from "../models/User.js";
import { normalizeMobile } from "../helpers/mobileHelper.js";

const APPLY = process.argv.includes("--apply");

const run = async () => {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once("open", resolve);
      mongoose.connection.once("error", reject);
    });
  }

  const users = await User.find({ mobile: { $type: "string" } })
    .select("_id name phone_code mobile")
    .lean();

  console.log(`Checked ${users.length} users with a mobile number.`);
  console.log(
    APPLY
      ? "APPLY MODE — writing changes"
      : "DRY RUN — no changes (pass --apply to write)",
  );
  console.log("");

  let changed = 0;
  let invalid = 0;

  for (const user of users) {
    const phoneCode = user.phone_code || "91";
    const normalized = normalizeMobile(user.mobile, phoneCode);

    if (normalized === null) {
      invalid += 1;
      console.log(
        `  INVALID  ${user._id}  "${user.name}"  phone_code=${phoneCode} mobile="${user.mobile}" — could not normalize, left as-is, needs manual review`,
      );
      continue;
    }

    if (normalized !== user.mobile) {
      changed += 1;
      console.log(
        `  FIX      ${user._id}  "${user.name}"  "${user.mobile}" -> "${normalized}"`,
      );
      if (APPLY) {
        await User.updateOne(
          { _id: user._id },
          { $set: { mobile: normalized } },
        );
      }
    }
  }

  console.log("");
  console.log(
    `${APPLY ? "Fixed" : "Would fix"} ${changed} mobile value(s). ${invalid} could not be normalized (manual review needed).`,
  );
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
