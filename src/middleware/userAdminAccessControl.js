import { StatusError } from '../config/StatusErrors.js';
import { resolveAuthorization } from '../services/rbac/authorization.js';

export const userAdminAccessControl = async (req, res, next) => {
  try {
    const context = await resolveAuthorization(req);
    if (!context.role) throw StatusError.forbidden('You are not authorized to access this resource.');
    next();
  } catch (error) { next(error); }
};
