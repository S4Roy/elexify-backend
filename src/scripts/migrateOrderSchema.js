import mongoose from "../config/mongoose.js";
import Order from "../models/Order.js";
import { collectOrderMigrationPreflight } from "./preflightOrderMigration.js";
import CouponUsage from "../models/CouponUsage.js";
import StockTransaction from "../models/StockTransaction.js";
import ProviderOrderAttempt from "../models/ProviderOrderAttempt.js";

const run = async () => {
  if (process.env.MIGRATION_CONFIRMED !== "yes") {
    throw new Error("Refusing migration without MIGRATION_CONFIRMED=yes after backup and staging preflight");
  }
  const preflight = await collectOrderMigrationPreflight();
  if (!preflight.safe_to_migrate) throw new Error(JSON.stringify(preflight, null, 2));
  const result = await Order.collection.updateMany(
    { exchnage_rate: { $exists: true }, exchange_rate: { $exists: false } },
    [{ $set: { exchange_rate: "$exchnage_rate" } }, { $unset: "exchnage_rate" }],
  );
  console.log(`Migrated exchange_rate on ${result.nModified ?? result.modifiedCount ?? 0} order(s)`);
  await Promise.all([
    Order.syncIndexes(), CouponUsage.syncIndexes(),
    StockTransaction.syncIndexes(), ProviderOrderAttempt.syncIndexes(),
  ]);
  const [orderIndexes, couponIndexes, ledgerIndexes, providerIndexes] = await Promise.all([
    Order.collection.indexes(), CouponUsage.collection.indexes(), StockTransaction.collection.indexes(),
    ProviderOrderAttempt.collection.indexes(),
  ]);
  if (
    !orderIndexes.some((index) => index.key?.id === 1 && index.unique) ||
    !orderIndexes.some((index) => index.key?.user === 1 && index.key?.idempotency_key === 1 && index.unique) ||
    !couponIndexes.some((index) => index.key?.order === 1 && index.unique) ||
    !ledgerIndexes.some((index) => index.unique && index.key?.reference_id === 1 && index.key?.product === 1) ||
    !providerIndexes.some((index) => index.key?.user === 1 && index.key?.idempotency_key === 1 && index.unique) ||
    !providerIndexes.some((index) => index.key?.provider_order_id === 1 && index.unique)
  ) {
    throw new Error("Required financial uniqueness index verification failed");
  }
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error?.message || error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
