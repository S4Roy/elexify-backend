import User from '../../models/User.js';
import Role from '../../models/Role.js';
import { ROLE_PERMISSIONS } from '../../constants/adminPermissions.js';
import { ensureOwnerAccess, registeredPermissionKeys, OWNER_EMAIL } from './owner.js';
import { MODULE_PERMISSIONS, MANAGEMENT_PERMISSIONS } from '../../constants/rbacPermissions.js';

export async function migrateRbac({ dryRun = false } = {}) {
  const keys = registeredPermissionKeys();
  if (dryRun) {
    const owner = await User.findOne({ email: OWNER_EMAIL, role: 'superadmin', deleted_at: null }).select('admin_role_id').lean();
    const role = owner?.admin_role_id ? await Role.findById(owner.admin_role_id).select('permissions status protected').lean() : null;
    return {
      ownerFound: !!owner, permissions: keys.length,
      ownerPermissionCount: role?.permissions?.length || 0,
      ownerMissingPermissions: keys.filter(key => !role?.permissions?.includes(key)),
      ownerRoleProtected: role?.protected === true, ownerRoleStatus: role?.status || null,
      unassigned: await User.countDocuments({ role: { $in: Object.keys(ROLE_PERMISSIONS) }, admin_role_id: null, deleted_at: null, rbac_migrated: { $ne: true } }),
    };
  }
  const owner = await ensureOwnerAccess();
  for (const [legacy, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    // Only bootstrap mapping knows legacy labels. Runtime authorization never does.
    const role = await Role.findOneAndUpdate({ key: `legacy-${legacy}` }, { $setOnInsert: {
      name: legacy, description: 'Migrated legacy access; review before assigning new staff.',
      status: 'active', system_role: true, protected: legacy === 'superadmin',
      permissions: [...new Set([...permissions, ...MODULE_PERMISSIONS, ...(legacy === 'superadmin' ? MANAGEMENT_PERMISSIONS : []),
        // These return refund operations were previously limited by return.review.
      ])],
    } }, { upsert: true, new: true });
    await User.updateMany({ role: legacy, admin_role_id: null, deleted_at: null, rbac_migrated: { $ne: true } }, { $set: { admin_role_id: role._id, rbac_migrated: true } });
  }
  return { permissions: keys.length, migrated: true, ownerFound: owner.ownerFound };
}
