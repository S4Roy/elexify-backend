import { runImportPincodes } from "../../../importPincodes.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";

// Reads and parses a ~154k-row CSV before it knows what's missing, so an
// accurate no-write preview costs almost the same as actually running it —
// declared honestly as not dry-run-capable rather than faking a cheap
// estimate (per plan §15: "everything else declares false honestly").
const handler = async (context) => {
  const { result } = await runImportPincodes({ logger: context.logger });
  return result;
};

export default {
  key: "pincodes",
  name: "Import India Pincodes",
  description: "Imports the India Post pincode directory (~19k pincodes) into the pincodes collection, resolved to City/State/Country.",
  type: "SEEDER",
  category: "geography",
  version: 1,
  required: false,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Upserts ~19,100 Pincode documents by pincode; never touches an existing row's `status`.",
  supportsDryRun: false,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
};
