/**
 * Backfill customer-facing references for packages created before reference_id.
 *
 * Usage:
 *   node src/scripts/backfillPackageReferences.js          # dry run
 *   node src/scripts/backfillPackageReferences.js --apply  # persist
 */
import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Order from "../models/Order.js";
import Package from "../models/Package.js";
import { packageReference } from "../services/orderService/packages/packageReference.js";

export const backfillPackageReferences = async ({ apply = false } = {}) => {
  const missingReference = { $or: [{ reference_id: null }, { reference_id: "" }] };
  const packages = await Package.find(missingReference)
    .select("_id order_id package_number")
    .lean();
  const orderIds = [...new Set(packages.map((pkg) => String(pkg.order_id)))];
  const orders = await Order.find({ _id: { $in: orderIds } }).select("_id id").lean();
  const orderIdByMongoId = new Map(orders.map((order) => [String(order._id), order.id]));
  const operations = [];
  let skipped = 0;

  for (const pkg of packages) {
    const reference = packageReference(orderIdByMongoId.get(String(pkg.order_id)), pkg.package_number);
    if (!reference) {
      skipped += 1;
      continue;
    }
    operations.push({
      updateOne: {
        filter: { _id: pkg._id, ...missingReference },
        update: { $set: { reference_id: reference } },
      },
    });
  }

  if (apply && operations.length) await Package.bulkWrite(operations, { ordered: false });
  return { found: packages.length, eligible: operations.length, skipped, applied: apply };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await mongooseConnection;
    console.log(await backfillPackageReferences({ apply: process.argv.includes("--apply") }));
    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
    await mongoose.disconnect();
    process.exitCode = 1;
  }
}
