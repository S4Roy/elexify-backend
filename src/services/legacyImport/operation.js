import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { readSource } from './source.js';
import { buildPlan } from './plan.js';
import User from '../../models/User.js';
import Order from '../../models/Order.js';
import OrderItem from '../../models/OrderItem.js';
import Rating from '../../models/Rating.js';
import Product from '../../models/Product.js';
import ProductVariation from '../../models/ProductVariation.js';
import SystemOperationExecution from '../../models/SystemOperationExecution.js';
import { heartbeatLock } from '../../scripts/shared/lock.js';
import { PartialExecutionError } from '../../scripts/shared/errors.js';

export const KEY = 'woocommerce-missing-data';
const models = { User, Order, OrderItem, Rating };
// Fixed server-side source: no uploaded SQL, shell execution or client-controlled paths.
const sourcePath = fileURLToPath(new URL('../../../db-backups/eqstoxco_wp434.sql', import.meta.url));
export async function handler(context) {
  let source;
  try { source = await readSource(sourcePath); }
  catch { throw Error('Cannot read the configured WooCommerce backup. Check that the complete wpgh_ SQL export is available on this server and HPOS is disabled.'); }
  const [users, orders, products, variations, reviews] = await Promise.all([
    User.find({}).select('_id email role deleted_at').lean(),
    Order.find({}).select('_id id transaction_id is_migrated grand_total currency deleted_at').lean(),
    Product.find({}).select('_id sku deleted_at').lean(),
    ProductVariation.find({}).select('_id product_id sku deleted_at').lean(),
    Rating.find({}).select('_id user product_id variation_id').lean(),
  ]);
  const plan = buildPlan(source, { users, orders, products, variations, reviews });
  // Validate all candidate documents before accepting the preview or doing any writes.
  for (const group of plan.groups) for (const { model, doc } of group.docs) {
    const error = new models[model](doc).validateSync();
    if (error) throw Error(`Candidate ${model} failed schema validation. No import has started.`);
  }
  const counts = Object.values(plan.summary);
  const report = {
    fingerprint: plan.fingerprint,
    summary: plan.summary, issues: plan.issues, issueCounts: plan.issueCounts,
    wouldInsert: counts.reduce((n, c) => n + c.missing, 0),
    wouldSkip: counts.reduce((n, c) => n + c.existing, 0),
    blocked: counts.reduce((n, c) => n + c.blocked, 0),
    wouldUpdate: 0, wouldDelete: 0,
  };
  for (const [kind, count] of Object.entries(plan.summary)) context.logger.info(`${kind}: ${count.missing} missing, ${count.existing} existing, ${count.blocked} need review.`);
  for (const [reason, count] of Object.entries(plan.issueCounts)) context.logger.warn(`${reason}: ${count}`);
  if (context.dryRun) return report;
  const audit = await SystemOperationExecution.findOne({ operation_key: KEY, environment: context.environment, dry_run: true, status: 'SUCCESS', 'result.fingerprint': plan.fingerprint, completed_at: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }).lean();
  if (!audit) throw Error('Run Audit Missing Data again before importing. The backup or matching records changed, or the audit is more than one hour old.');
  // Transactions guarantee that an order and all its items are committed together.
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw Error('Import requires MongoDB replica-set transactions. Audit is available on standalone MongoDB.');
  let inserted = 0;
  const session = await mongoose.startSession();
  try {
    for (const group of plan.groups) {
      await heartbeatLock(KEY, context.executionId);
      await session.withTransaction(async () => {
        for (const { model, doc } of group.docs) {
          if (doc.user && !await User.exists({ _id: doc.user, deleted_at: null }).session(session)) throw Error('Customer changed during import');
          if (doc.product_id && !await Product.exists({ _id: doc.product_id, deleted_at: null }).session(session)) throw Error('Product changed during import');
          if (model === 'Order' && doc.transaction_id && await Order.exists({ transaction_id: doc.transaction_id }).session(session)) throw Error('Payment reference changed during import');
          await models[model].create([doc], { session });
        }
      });
      inserted++;
    }
    context.logger.info(`Imported ${inserted} missing records. Existing records were not changed.`);
    return { ...report, inserted, updated: 0, deleted: 0, skipped: report.wouldSkip, warnings: report.blocked };
  } catch {
    throw new PartialExecutionError('Import stopped because a record changed or could not be saved. Completed records are retained; run a new audit before retrying.', { ...report, inserted, updated: 0, deleted: 0, skipped: report.wouldSkip });
  } finally { await session.endSession(); }
}
