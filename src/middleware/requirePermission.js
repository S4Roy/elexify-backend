import { StatusError } from "../config/index.js";
import { roleHasPermission } from "../constants/adminPermissions.js";

/**
 * requirePermission(permission) — route-level guard for the new Phase 2
 * admin customer/notification endpoints. Must run after
 * userAdminAccessControl (which already confirmed req.auth.role is a valid
 * admin-panel role) — this only adds a finer-grained check on top.
 */
export const requirePermission = (permission) => (req, res, next) => {
  const role = req.auth?.role;
  if (!role || !roleHasPermission(role, permission)) {
    return next(StatusError.forbidden("You do not have permission to perform this action."));
  }
  next();
};
