import User from '../../models/User.js';
import Role from '../../models/Role.js';
import { StatusError } from '../../config/StatusErrors.js';

// Request-scoped only: never trust role/permission claims in a JWT or payload.
export async function resolveAuthorization(req) {
  if (req.authorization) return req.authorization;
  if (!req.auth?.user_id) throw StatusError.unauthorized('Please login to continue.');
  const user = await User.findOne({ _id: req.auth.user_id, status: 'active', deleted_at: null })
    .select('_id admin_role_id password_changed_at').lean();
  if (!user) throw StatusError.unauthorized('Please login to continue.');
  // Token issued before the last password change — reject so a change-password
  // action actually ends other sessions instead of just the current tab.
  if (user.password_changed_at && req.auth.iat < Math.floor(new Date(user.password_changed_at).getTime() / 1000)) {
    throw StatusError.unauthorized('Session expired. Please login again.');
  }
  const role = user.admin_role_id ? await Role.findOne({ _id: user.admin_role_id, status: 'active', deleted_at: null }).lean() : null;
  req.authorization = { user, role, permissions: new Set(role?.permissions || []) };
  return req.authorization;
}
export const hasPermission = (req, key) => req.authorization?.permissions?.has(key) === true;
export function assertDelegable(context, role) {
  if (!role || role.protected || (role.permissions || []).some(key => !context.permissions.has(key))) {
    throw StatusError.forbidden('You cannot manage this role.');
  }
}
