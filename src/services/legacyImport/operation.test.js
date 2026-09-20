import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
vi.mock('./source.js', () => ({ readSource: vi.fn(async () => ({ fingerprint: 'source' })) }));
vi.mock('./plan.js', () => ({ buildPlan: vi.fn() }));
vi.mock('../../scripts/shared/lock.js', () => ({ heartbeatLock: vi.fn(async () => {}) }));
import { buildPlan } from './plan.js';
import { handler } from './operation.js';
import User from '../../models/User.js';
import Order from '../../models/Order.js';
import Product from '../../models/Product.js';
import ProductVariation from '../../models/ProductVariation.js';
import Rating from '../../models/Rating.js';
import SystemOperationExecution from '../../models/SystemOperationExecution.js';
const context = dryRun => ({ dryRun, environment: 'test', executionId: 'fixture', logger: { info: vi.fn(), warn: vi.fn() } });
const originalDb = mongoose.connection.db;
afterEach(() => { vi.restoreAllMocks(); mongoose.connection.db = originalDb; });
beforeEach(() => {
  for (const model of [User, Order, Product, ProductVariation, Rating]) vi.spyOn(model, 'find').mockReturnValue({ select: () => ({ lean: async () => [] }) });
  vi.spyOn(User, 'create').mockResolvedValue([]);
  buildPlan.mockReturnValue({ fingerprint: 'audited-plan', groups: [{ type: 'customers', docs: [{ model: 'User', doc: { _id: '123456789012345678901234', role: 'customer', name: 'Fixture' } }] }], summary: { customers: { total: 1, missing: 1, existing: 0, blocked: 0 } }, issues: [], issueCounts: {} });
});
describe('admin import execution safeguards', () => {
  it('audits without writing business records or opening a transaction', async () => {
    const session = vi.spyOn(mongoose, 'startSession');
    expect((await handler(context(true))).wouldInsert).toBe(1);
    expect(User.create).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
  });
  it('refuses a real run without a matching recent audit', async () => {
    const find = vi.spyOn(SystemOperationExecution, 'findOne').mockReturnValue({ lean: async () => null });
    await expect(handler(context(false))).rejects.toThrow('Run Audit Missing Data again');
    expect(find.mock.calls[0][0]['result.fingerprint']).toBe('audited-plan');
    expect(User.create).not.toHaveBeenCalled();
  });
  it('refuses writes on standalone MongoDB', async () => {
    vi.spyOn(SystemOperationExecution, 'findOne').mockReturnValue({ lean: async () => ({}) });
    mongoose.connection.db = { admin: () => ({ command: async () => ({}) }) };
    await expect(handler(context(false))).rejects.toThrow('replica-set');
    expect(User.create).not.toHaveBeenCalled();
  });
  it('uses a transaction and reports partial failure without leaking database errors', async () => {
    vi.spyOn(SystemOperationExecution, 'findOne').mockReturnValue({ lean: async () => ({}) });
    mongoose.connection.db = { admin: () => ({ command: async () => ({ setName: 'test' }) }) };
    const session = { withTransaction: vi.fn(async fn => fn()), endSession: vi.fn(async () => {}) };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    User.create.mockRejectedValue(Error('private database details'));
    await expect(handler(context(false))).rejects.toMatchObject({ partialResult: { inserted: 0 } });
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(User.create.mock.calls[0][1].session).toBe(session);
  });
});
