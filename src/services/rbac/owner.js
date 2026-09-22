import mongoose from 'mongoose';
import Role from '../../models/Role.js';
import Permission from '../../models/Permission.js';
import User from '../../models/User.js';
import AuditLog from '../../models/AuditLog.js';
import { PERMISSIONS } from '../../constants/adminPermissions.js';
import { MODULE_PERMISSIONS, MANAGEMENT_PERMISSIONS } from '../../constants/rbacPermissions.js';

// Provisioning identity requested by the installation owner. This is not a runtime
// email/role-name bypass: requests still resolve the persisted role and permissions.
export const OWNER_EMAIL = 'baseweb.in@gmail.com';
export const registeredPermissionKeys = () => [...new Set([...Object.values(PERMISSIONS), ...MODULE_PERMISSIONS, ...MANAGEMENT_PERMISSIONS])];
export async function seedPermissionCatalog() {
  await Permission.init();
  const keys = registeredPermissionKeys();
  await Permission.bulkWrite(keys.map(key => ({ updateOne: { filter: { _id: key }, update: { $setOnInsert: {
    name: key, module: key.split('.')[0], action: key.split('.').slice(1).join('.'), description: key,
  } }, upsert: true } })));
}

// Called before serving requests and by the migration. Do not create an account,
// reset credentials, reactivate a blocked user, or promote a storefront identity.
export async function ensureOwnerAccess() {
  await seedPermissionCatalog();
  await Role.init();
  const keys = (await Permission.find().select('_id').lean()).map(permission => permission._id).sort();
  await AuditLog.init();
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const previous = await Role.findOne({ key: 'legacy-superadmin' }).session(session).lean();
      const role = await Role.findOneAndUpdate({ key: 'legacy-superadmin' }, {
        $setOnInsert: { name: 'superadmin', description: 'Protected existing platform owner' },
        $set: { permissions: keys, status: 'active', system_role: true, protected: true, deleted_at: null },
      }, { new: true, upsert: true, session });
      const owner = await User.findOne({ email: OWNER_EMAIL, role: 'superadmin', deleted_at: null })
        .select('_id admin_role_id rbac_migrated').session(session);
      const assignmentChanged = owner && (String(owner.admin_role_id) !== String(role._id) || !owner.rbac_migrated);
      const permissionsChanged = !previous || JSON.stringify([...previous.permissions].sort()) !== JSON.stringify(keys);
      if (assignmentChanged) {
        await User.updateOne({ _id: owner._id, role: 'superadmin', deleted_at: null },
          { $set: { admin_role_id: role._id, rbac_migrated: true } }, { session });
      }
      if (owner && (assignmentChanged || permissionsChanged)) {
        await AuditLog.create([{ user_id: owner._id, event: 'RBAC_OWNER_SEEDED', metadata: {
          before: owner.admin_role_id, role_id: role._id, source: 'bootstrap',
          previous_permissions: previous?.permissions || [], permissions: keys,
        } }], { session });
      }
      result = { ownerFound: !!owner, permissions: keys.length, role_id: role._id };
    });
    return result;
  } finally { await session.endSession(); }
}
