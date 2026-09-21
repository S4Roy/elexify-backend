import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../models/Rating.js', () => ({ default: { aggregate: vi.fn(), countDocuments: vi.fn() } }));
vi.mock('../../../config/index.js', () => ({ envs: { pagination: { limit: 20 } }, StatusError: { badRequest: message => new Error(message) } }));
vi.mock('../../../resources/RatingResource.js', () => ({ default: { collection: vi.fn(async docs => docs) } }));
vi.mock('../../../services/legacyImport/filter.js', () => ({
  legacyReviewIds: vi.fn(), sourceCondition: vi.fn(() => ({ 'legacy_import.source': 'eqstoxco_wp434' })),
  sourceExpression: vi.fn(() => ({ $eq: ['$legacy_import.source', 'eqstoxco_wp434'] })),
}));
import Rating from '../../../models/Rating.js';
import { legacyReviewIds } from '../../../services/legacyImport/filter.js';
import { list } from './list.js';
let res, next;
beforeEach(() => {
  vi.clearAllMocks();
  Rating.aggregate.mockResolvedValue([{ _id: 'review-1' }]);
  Rating.countDocuments.mockResolvedValue(105);
  legacyReviewIds.mockResolvedValue([]);
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  next = vi.fn();
});
const run = query => list({ query, params: {}, __: value => value }, res, next);
describe('admin review list performance', () => {
  it('does not load the SQL backup for normal browsing and joins only one page', async () => {
    await run({ page: 2, limit: 20 });
    expect(next).not.toHaveBeenCalled();
    expect(legacyReviewIds).not.toHaveBeenCalled();
    const pipeline = Rating.aggregate.mock.calls[0][0];
    expect(pipeline.slice(0, 4)).toEqual([
      { $match: { deleted_at: null } }, { $sort: { created_at: -1, _id: -1 } }, { $skip: 20 }, { $limit: 20 },
    ]);
    expect(pipeline.findIndex(stage => stage.$lookup)).toBeGreaterThan(3);
    expect(Rating.countDocuments).toHaveBeenCalledWith({ deleted_at: null });
    expect(res.json.mock.calls[0][0].data).toMatchObject({ totalDocs: 105, totalPages: 6, page: 2, limit: 20, prevPage: 1, nextPage: 3 });
  });
  it('retains backup compatibility only when explicitly filtering import source', async () => {
    await run({ import_source: 'backup' });
    expect(legacyReviewIds).toHaveBeenCalledOnce();
    expect(Rating.countDocuments.mock.calls[0][0].$and).toBeDefined();
  });
  it('shares status/rating/search filters between count and page and escapes regex', async () => {
    await run({ search_key: 'a.*', status: 'approved,pending', rating: '4,5' });
    const filter = Rating.countDocuments.mock.calls[0][0];
    expect(filter).toMatchObject({ status: { $in: ['approved', 'pending'] }, rating: { $in: [4,5] } });
    expect(filter.$or[0].description.$regex).toBe('a\\.\\*');
    expect(Rating.aggregate.mock.calls[0][0][0].$match).toEqual(filter);
  });
  it('caps page size and returns stable empty-page metadata', async () => {
    Rating.aggregate.mockResolvedValue([]);
    Rating.countDocuments.mockResolvedValue(0);
    await run({ limit: 10000 });
    expect(res.json.mock.calls[0][0].data).toMatchObject({ docs: [], totalDocs: 0, totalPages: 1, limit: 100, hasNextPage: false, hasPrevPage: false });
  });
});
