import { runBackfillOrderAddressSnapshots } from "../../../backfillOrderAddressSnapshots.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

const handler = async (context) => {
  const { result, dryRunPreview } = await runBackfillOrderAddressSnapshots({ apply: !context.dryRun, logger: context.logger });
  return context.dryRun ? dryRunPreview : result;
};

export default {
  key: "backfill-order-address-snapshots",
  name: "Backfill Order Address Snapshots (State)",
  description: "Repairs order billing/shipping address snapshots whose state came out null (self-service addresses never denormalized state_name), re-deriving it from the referenced address's live location IDs. Fixes silently-dropped Zoho \"State of Supply\" (place_of_contact) on already-placed orders.",
  type: "BACKFILL",
  category: "orders",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Sets billing_address_snapshot.state/city/country (and the same for shipping) on every order whose snapshot has state: null, using its referenced address's live location IDs. No other order field is touched.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
