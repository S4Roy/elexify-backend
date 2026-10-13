import { beforeEach, expect, it, vi } from 'vitest';
import User from '../../../models/User.js';
import AuthEvent from '../../../models/AuthEvent.js';
import { sessionSummary } from '../../../services/customerSession/index.js';
import { listSessions, securityEvents } from './sessions.js';
vi.mock('../../../models/User.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../../models/AuthEvent.js', () => ({ default: { aggregate: vi.fn(), aggregatePaginate: vi.fn() } }));
vi.mock('../../../services/customerSession/index.js', () => ({ sessionSummary: vi.fn() }));
const id = '507f1f77bcf86cd799439011';
const res = () => ({ setHeader: vi.fn(), json: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  User.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: id }) }) });
  sessionSummary.mockResolvedValue({ docs: [] });
  AuthEvent.aggregate.mockReturnValue('aggregation');
  AuthEvent.aggregatePaginate.mockResolvedValue({ docs: [] });
});
it('supports selected session page sizes with a safe maximum and preserves five by default', async () => {
  for (const [value, expected] of [[undefined, 5], ['25', 25], ['200', 100], ['bad', 5]]) {
    await listSessions({ params: { id }, query: { page: '2', limit: value } }, res(), vi.fn());
    expect(sessionSummary).toHaveBeenLastCalledWith(id, undefined, { page: 2, limit: expected });
  }
});
it('passes the selected authentication-history size and retains its existing default', async () => {
  await securityEvents({ params: { id }, query: { page: 2, limit: '25' } }, res(), vi.fn());
  expect(AuthEvent.aggregatePaginate).toHaveBeenLastCalledWith(expect.anything(), { page: 2, limit: 25 });
  await securityEvents({ params: { id }, query: {} }, res(), vi.fn());
  expect(AuthEvent.aggregatePaginate).toHaveBeenLastCalledWith(expect.anything(), { page: 1, limit: 10 });
});
