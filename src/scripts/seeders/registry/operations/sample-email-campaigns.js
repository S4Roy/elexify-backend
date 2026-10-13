import Campaign from '../../../../models/EmailCampaign.js';
import { seedSampleCampaigns, SAMPLE_CAMPAIGN_KEYS } from '../../../../services/campaigns/samples.js';
import { PERMISSIONS } from '../../../../constants/adminPermissions.js';
export default {
  key: 'sample-email-campaigns', name: 'Seed Sample Email Campaigns',
  description: 'Adds five editable ecommerce newsletter drafts. Never queues emails or overwrites existing samples.',
  type: 'SEEDER', category: 'notifications', version: 1, required: false, idempotent: true, risk: 'LOW',
  allowedEnvironments: ['development', 'test', 'production'], dependencies: [],
  estimatedImpact: 'Inserts up to five draft EmailCampaign records. Existing content, revisions and send state are preserved.',
  supportsDryRun: true, requiresConfirmation: false, permission: PERMISSIONS.SEEDER_EXECUTE,
  handler: async context => {
    const result = await seedSampleCampaigns({ dryRun: context.dryRun });
    context.logger.info(context.dryRun ? `Would add ${result.wouldInsert} sample campaign draft(s).` : `Added ${result.inserted} sample campaign draft(s); preserved ${result.skipped} existing sample(s).`);
    return result;
  },
  healthCheck: async () => {
    const actual = await Campaign.countDocuments({ sample_key: { $in: SAMPLE_CAMPAIGN_KEYS } });
    return { status: actual === SAMPLE_CAMPAIGN_KEYS.length ? 'HEALTHY' : 'DEGRADED', actual, expected: SAMPLE_CAMPAIGN_KEYS.length, detail: `${actual}/${SAMPLE_CAMPAIGN_KEYS.length} sample campaigns present.` };
  },
};
