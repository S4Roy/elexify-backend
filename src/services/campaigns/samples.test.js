import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/EmailCampaign.js', () => ({ default: { find: vi.fn(), createIndexes: vi.fn(), updateOne: vi.fn() } }));
import Campaign from '../../models/EmailCampaign.js';
import { sampleCampaigns, seedSampleCampaigns, SAMPLE_CAMPAIGN_KEYS } from './samples.js';
describe('sample campaign drafts', () => {
  beforeEach(() => { vi.clearAllMocks(); Campaign.find.mockReturnValue({ select: () => ({ lean: async () => [] }) }); });
  it('provides five unique complete drafts without schedule or recipients', () => {
    const samples = sampleCampaigns();
    expect(samples).toHaveLength(5); expect(new Set(samples.map(sample => sample.sample_key)).size).toBe(5);
    for (const sample of samples) {
      expect(sample).toMatchObject({ status: 'draft', source: 'all', revision: 1 });
      expect(sample.subject.length).toBeGreaterThan(0); expect(sample.preheader.length).toBeGreaterThan(0);
      expect(sample.body).toContain('https://'); expect(sample.body).not.toMatch(/script|\[.*?\]/);
      expect(sample.scheduled_at).toBeUndefined();
    }
  });
  it('dry run counts missing samples without writes', async () => {
    Campaign.find.mockReturnValue({ select: () => ({ lean: async () => [{ sample_key: SAMPLE_CAMPAIGN_KEYS[0] }] }) });
    expect(await seedSampleCampaigns({ dryRun: true })).toMatchObject({ wouldInsert: 4, wouldSkip: 1 });
    expect(Campaign.createIndexes).not.toHaveBeenCalled(); expect(Campaign.updateOne).not.toHaveBeenCalled();
  });
  it('only inserts missing drafts, preserving content, dates and send status on rerun', async () => {
    Campaign.updateOne.mockResolvedValue({ upsertedCount: 0 });
    expect(await seedSampleCampaigns()).toMatchObject({ inserted: 0, skipped: 5, updated: 0 });
    for (const [filter, update, options] of Campaign.updateOne.mock.calls) {
      expect(filter.sample_key).toBeTruthy(); expect(Object.keys(update)).toEqual(['$setOnInsert']);
      expect(update.$setOnInsert.status).toBe('draft'); expect(options).toMatchObject({ upsert: true, timestamps: false, runValidators: true });
    }
  });
});
