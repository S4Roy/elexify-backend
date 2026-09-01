import ShippingZone from "../../../../models/ShippingZone.js";
import ShippingRate from "../../../../models/ShippingRate.js";
import { runSeedShipping } from "../../../seedShipping.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  if (context.dryRun) {
    const existingDefaultZone = await ShippingZone.findOne({ is_default: true });
    const wouldInsert = existingDefaultZone ? 0 : 3; // class + zone + rate
    context.logger.info(wouldInsert ? "Dry run: would create default shipping class/zone/rate." : "Dry run: a default shipping zone already exists — nothing would change.");
    return { wouldInsert, wouldUpdate: 0, wouldSkip: wouldInsert ? 0 : 1, wouldDelete: 0 };
  }

  const { result } = await runSeedShipping({ logger: context.logger });
  return result;
};

const healthCheck = async () => {
  const zone = await ShippingZone.findOne({ is_default: true }).lean();
  const rateCount = zone ? await ShippingRate.countDocuments({ zone: zone._id }) : 0;
  const healthy = Boolean(zone) && rateCount > 0;
  return {
    status: healthy ? "HEALTHY" : "DEGRADED",
    expected: 1,
    actual: zone ? 1 : 0,
    detail: healthy ? "Default shipping zone and rate present." : "No default shipping zone/rate configured — checkout shipping calculation will fail.",
  };
};

export default {
  key: "shipping",
  name: "Seed Shipping Defaults",
  description: "Seeds a minimal default shipping configuration (standard class, all-India zone, flat rate) so checkout works out of the box.",
  type: "SEEDER",
  category: "commerce",
  version: 1,
  required: true,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Creates one ShippingClass, one ShippingZone, one ShippingRate on first run only.",
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
