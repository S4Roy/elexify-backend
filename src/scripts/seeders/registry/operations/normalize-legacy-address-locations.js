import { runNormalizeLegacyAddressLocations } from "../../../normalizeLegacyAddressLocations.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result, dryRunPreview } = await runNormalizeLegacyAddressLocations({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "normalize-legacy-address-locations",
  name: "Normalize Legacy Address Locations",
  description: "Converts WooCommerce-era addresses that store ISO/state codes and city names (country \"IN\", state \"WB\") into numeric catalog ids with country/state/city names, and rewrites coded order snapshot country/state as names. Fixes \"Cast to Number failed for value \\\"IN\\\"\" on the admin customer address list.",
  type: "REPAIR",
  category: "addresses",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Sets country/state/city, their *_name fields and legacy_location (original values) on addresses with non-numeric location values; sets billing/shipping_address_snapshot.country/state to names on orders whose snapshot holds codes. No other field is touched.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
