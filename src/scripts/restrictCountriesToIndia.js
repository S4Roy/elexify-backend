// Bootstraps "India only" checkout: sets every Country except India to
// inactive. The storefront's country dropdown (site/common/countries) and
// address validation already only allow `status: "active"` countries, so
// this alone is enough — an admin can re-enable others later from
// Settings > Countries in the admin panel, no code change needed.
//
// Usage: node src/scripts/restrictCountriesToIndia.js

import mongoose from "../config/mongoose.js";
import Country from "../models/Country.js";

const INDIA_ID = 101;

const run = async () => {
  const result = await Country.updateMany(
    { id: { $ne: INDIA_ID } },
    { $set: { status: "inactive" } },
  );
  await Country.updateOne({ id: INDIA_ID }, { $set: { status: "active" } });

  const active = await Country.countDocuments({ status: "active" });
  console.log(`Deactivated ${result.modifiedCount} countries. Active countries now: ${active}.`);

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
