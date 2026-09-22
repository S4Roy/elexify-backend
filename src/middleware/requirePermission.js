import { recordAudit } from '../services/audit/recordAudit.js';
import { StatusError } from '../config/StatusErrors.js';
import { resolveAuthorization } from '../services/rbac/authorization.js';

export const requirePermission = (...permissions) => async (req, res, next) => {
  try {
    const context = await resolveAuthorization(req);
    if (!permissions.every(key => context.permissions.has(key))) {
      throw StatusError.forbidden('You do not have permission to perform this action.');
    }
    if (req.method && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && res.once) {
      req.requiredPermissions = [...new Set([...(req.requiredPermissions || []), ...permissions])];
      if (!req.permissionAuditRegistered) {
        req.permissionAuditRegistered = true;
        res.once('finish', () => {
          if (res.statusCode < 400) void recordAudit({ userId: req.auth.user_id, actorId: req.auth.user_id, event: 'RBAC_ADMIN_ACTION', req,
            metadata: { permissions: req.requiredPermissions, method: req.method, path: req.baseUrl + req.path,
              target_id: String(req.params?.id || req.body?._id || req.body?.order_id || '').slice(0, 100) } });
        });
      }
    }
    next();
  } catch (error) { next(error); }
};

// For existing upsert APIs; the controller must additionally authorize the actual branch.
export const requireAnyPermission = (...permissions) => async (req, res, next) => {
  try {
    const context = await resolveAuthorization(req);
    const allowed = permissions.find(key => context.permissions.has(key));
    if (!allowed) throw StatusError.forbidden('You do not have permission to perform this action.');
    return requirePermission(allowed)(req, res, next);
  } catch (error) { next(error); }
};
