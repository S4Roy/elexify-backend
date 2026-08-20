import { StatusError } from "../config/index.js";

// Roles allowed to use the admin panel API. "customer", "vendor", and "user"
// are storefront-side roles and must never reach /api/v1/admin/*.
const ADMIN_PANEL_ROLES = [
  "superadmin",
  "manager",
  "supervisor",
  "staff",
  "operator",
];

/**
 * Ensures the authenticated user (set by validateAccessToken) holds an
 * admin-panel role before allowing access to admin routes.
 * @param req
 * @param res
 * @param next
 */
export const userAdminAccessControl = (req, res, next) => {
  const role = req.auth?.role;
  if (!role || !ADMIN_PANEL_ROLES.includes(role)) {
    return next(StatusError.forbidden("You are not authorized to access this resource."));
  }
  next();
};
