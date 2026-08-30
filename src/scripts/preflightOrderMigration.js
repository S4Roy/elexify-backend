import mongoose, { mongooseConnection } from "../config/mongoose.js";
import Order from "../models/Order.js";
import CouponUsage from "../models/CouponUsage.js";
import StockTransaction from "../models/StockTransaction.js";
import ProviderOrderAttempt from "../models/ProviderOrderAttempt.js";
import { ORDER_STATUS_VALUES, PAYMENT_STATUS_VALUES } from "../constants/orderStatus.js";

export const collectOrderMigrationPreflight = async () => {
  await mongooseConnection;
  const [
    orderIdConflicts, couponUsageConflicts, stockLedgerConflicts, legacyExchangeRates,
    orderIdempotencyConflicts, providerKeyConflicts, providerIdConflicts,
    incompatibleOrderStatuses, incompatiblePaymentStatuses, collectionCounts,
  ] = await Promise.all([
    Order.aggregate([
      { $group: { _id: "$id", count: { $sum: 1 }, records: { $push: "$_id" } } },
      { $match: { $or: [{ _id: null }, { count: { $gt: 1 } }] } },
      { $limit: 100 },
    ]),
    CouponUsage.aggregate([
      { $group: { _id: "$order", count: { $sum: 1 }, records: { $push: "$_id" } } },
      { $match: { $or: [{ _id: null }, { count: { $gt: 1 } }] } },
      { $limit: 100 },
    ]),
    StockTransaction.aggregate([
      { $match: { reference_type: "order" } },
      { $group: {
        _id: { reference_id: "$reference_id", product: "$product", variation: "$variation", type: "$type" },
        count: { $sum: 1 }, records: { $push: "$_id" },
      } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 100 },
    ]),
    Order.collection.countDocuments({ exchnage_rate: { $exists: true } }),
    Order.aggregate([
      { $match: { idempotency_key: { $type: "string" } } },
      { $group: { _id: { user: "$user", key: "$idempotency_key" }, count: { $sum: 1 }, records: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } }, { $limit: 100 },
    ]),
    ProviderOrderAttempt.aggregate([
      { $group: { _id: { user: "$user", key: "$idempotency_key" }, count: { $sum: 1 }, records: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } }, { $limit: 100 },
    ]),
    ProviderOrderAttempt.aggregate([
      { $match: { provider_order_id: { $type: "string" } } },
      { $group: { _id: "$provider_order_id", count: { $sum: 1 }, records: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } }, { $limit: 100 },
    ]),
    Order.find({ order_status: { $nin: ORDER_STATUS_VALUES } }).select("_id id order_status").limit(100).lean(),
    Order.find({ payment_status: { $nin: PAYMENT_STATUS_VALUES } }).select("_id id payment_status").limit(100).lean(),
    Promise.all([
      Order.countDocuments(), CouponUsage.countDocuments(), StockTransaction.countDocuments(),
      ProviderOrderAttempt.countDocuments(),
    ]),
  ]);
  const conflictSets = [
    orderIdConflicts, couponUsageConflicts, stockLedgerConflicts, orderIdempotencyConflicts,
    providerKeyConflicts, providerIdConflicts, incompatibleOrderStatuses, incompatiblePaymentStatuses,
  ];
  return {
    safe_to_migrate: conflictSets.every((set) => !set.length),
    generated_at: new Date().toISOString(),
    conflicts: {
      public_order_ids: orderIdConflicts,
      coupon_usage_orders: couponUsageConflicts,
      stock_ledger_keys: stockLedgerConflicts,
      order_idempotency_keys: orderIdempotencyConflicts,
      provider_idempotency_keys: providerKeyConflicts,
      provider_order_ids: providerIdConflicts,
      incompatible_order_statuses: incompatibleOrderStatuses,
      incompatible_payment_statuses: incompatiblePaymentStatuses,
    },
    counts: {
      orders: collectionCounts[0], coupon_usages: collectionCounts[1],
      stock_transactions: collectionCounts[2], provider_order_attempts: collectionCounts[3],
    },
    legacy_exchange_rate_records: legacyExchangeRates,
    note: "No records were modified. Reconcile every listed financial conflict manually.",
  };
};

if (process.argv[1]?.endsWith("preflightOrderMigration.js")) {
  const runCli = async () => {
    let exitCode = 0;
    try {
      const report = await collectOrderMigrationPreflight();
      console.log(JSON.stringify(report, null, 2));
      if (!report.safe_to_migrate) exitCode = 2;
    } catch (error) {
      console.error(error?.message || error);
      exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
    process.exit(exitCode);
  };
  runCli();
}
