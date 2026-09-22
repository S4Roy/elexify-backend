import { StatusError } from "../config/index.js";
import { PERMISSIONS } from "../constants/adminPermissions.js";
import { resolveAuthorization } from "../services/rbac/authorization.js";
import { requirePermission } from "./requirePermission.js";
import { getOperation } from "../scripts/seeders/registry/index.js";

// BACKFILL operations are grouped with MIGRATION permissions — the plan's
// RBAC section defines exactly 8 permissions (no separate BACKFILL_*), and
// a backfill is, permission-wise, the same "data correction" category as a
// migration (as opposed to a first-time SEEDER or a REPAIR).
const VIEW_PERMISSION_BY_TYPE = {
  SEEDER: PERMISSIONS.SEEDER_VIEW,
  MIGRATION: PERMISSIONS.MIGRATION_VIEW,
  BACKFILL: PERMISSIONS.MIGRATION_VIEW,
  REPAIR: PERMISSIONS.REPAIR_VIEW,
};

const EXECUTE_PERMISSION_BY_TYPE = {
  SEEDER: PERMISSIONS.SEEDER_EXECUTE,
  MIGRATION: PERMISSIONS.MIGRATION_EXECUTE,
  BACKFILL: PERMISSIONS.MIGRATION_EXECUTE,
  REPAIR: PERMISSIONS.REPAIR_EXECUTE,
};

// requireOperationPermission("view"|"execute") — resolves req.params.key
// against the static registry to find the operation's type, then checks
// the matching *_VIEW/*_EXECUTE permission for that type. "view" also
// accepts the generic DATA_VIEW permission as a baseline. An unresolvable
// key still requires DATA_VIEW (never grants access outright) — the
// controller is responsible for the eventual 404 OPERATION_NOT_FOUND.
export const requireOperationPermission = (kind) => async (req, res, next) => {
  try {
    const context = await resolveAuthorization(req);
    const entry = req.params.key ? getOperation(req.params.key) : null;
    const table = kind === "execute" ? EXECUTE_PERMISSION_BY_TYPE : VIEW_PERMISSION_BY_TYPE;
    const candidates = entry ? [table[entry.type]] : [];
    if (kind !== "execute") candidates.push(PERMISSIONS.DATA_VIEW);
    if (!candidates.some(key => context.permissions.has(key))) throw StatusError.forbidden("You do not have permission to perform this action.");
    next();
  } catch (error) { next(error); }
};
export const requireDataView = requirePermission(PERMISSIONS.DATA_VIEW);
export const requireOperationHistoryView = requirePermission(PERMISSIONS.OPERATION_HISTORY_VIEW);
