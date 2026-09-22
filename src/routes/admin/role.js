import { Router } from 'express';
import { celebrate, Joi } from 'celebrate';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Role from '../../models/Role.js';
import Permission from '../../models/Permission.js';
import User from '../../models/User.js';
import AuditLog from '../../models/AuditLog.js';
import { StatusError } from '../../config/StatusErrors.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { assertDelegable } from '../../services/rbac/authorization.js';

export const roleRouter = Router();
const id = Joi.string().hex().length(24);
const params = celebrate({ params: Joi.object({ id: id.required() }) });
const body = schema => celebrate({ body: Joi.object(schema).required() });
const roleFields = {
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().max(1000).allow('').default(''),
  status: Joi.string().valid('active', 'inactive').default('active'),
  permissions: Joi.array().items(Joi.string().max(100)).unique().max(500).required(),
};
const endpoint = fn => async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); res.json({ status: 'success', data: await fn(req) }); }
  catch (error) { next(error.code === 11000 ? StatusError.conflict('This record already exists.') : error); }
};
const transaction = async fn => {
  const session = await mongoose.startSession();
  try { let result; await session.withTransaction(async () => { result = await fn(session); }); return result; }
  finally { await session.endSession(); }
};
const audit = async (req, session, event, metadata, userId = req.auth.user_id) => {
  await AuditLog.create([{ user_id: userId, actor_id: req.auth.user_id, event, metadata, ip: req.ip }], { session });
};
const validatePermissions = async (req, keys, session) => {
  if (keys.some(key => !req.authorization.permissions.has(key))) throw StatusError.forbidden('You cannot delegate these permissions.');
  if (await Permission.countDocuments({ _id: { $in: keys } }).session(session) !== keys.length) throw StatusError.badRequest('Unknown permission.');
};
const editableRole = async (req, roleId, session) => {
  const role = await Role.findOne({ _id: roleId, deleted_at: null }).session(session);
  if (!role) throw StatusError.notFound('Role not found.');
  assertDelegable(req.authorization, role);
  return role;
};
// Serialize assignment with role changes/deletion using a write to the role in the transaction.
const assignableRole = async (req, roleId, session) => {
  const role = await editableRole(req, roleId, session);
  if (role.status !== 'active') throw StatusError.badRequest('Role must be active.');
  await Role.updateOne({ _id: role._id }, { $inc: { __v: 1 } }, { session });
  return role;
};
const editableStaff = async (req, userId, session) => {
  if (String(req.auth.user_id) === String(userId)) throw StatusError.forbidden('You cannot modify your own access.');
  const user = await User.findOne({ _id: userId, rbac_migrated: true, deleted_at: null }).session(session);
  if (!user) throw StatusError.notFound('Staff member not found.');
  if (user.admin_role_id) await editableRole(req, user.admin_role_id, session);
  return user;
};

roleRouter.get('/me', endpoint(req => ({ permissions: [...req.authorization.permissions], role: { id: req.authorization.role._id, name: req.authorization.role.name }, scope: 'installation' })));
roleRouter.get('/permission-list', requirePermission('roles.view'), endpoint(() => Permission.find().sort({ module: 1, _id: 1 }).lean()));
roleRouter.get('/list', requirePermission('roles.view'), endpoint(async () => {
  const [roles, counts] = await Promise.all([Role.find({ deleted_at: null }).sort({ name: 1 }).lean(), User.aggregate([{ $match: { deleted_at: null, admin_role_id: { $ne: null } } }, { $group: { _id: '$admin_role_id', count: { $sum: 1 } } }])]);
  return roles.map(role => ({ ...role, user_count: counts.find(row => String(row._id) === String(role._id))?.count || 0 }));
}));
roleRouter.get('/staff', requirePermission('staff.view'), celebrate({ query: Joi.object({ page: Joi.number().integer().min(1).default(1), search: Joi.string().max(100).allow(''), paginated: Joi.boolean().default(false) }) }), endpoint(async req => {
  const filter = { rbac_migrated: true, deleted_at: null };
  if (req.query.search) filter.name = { $regex: req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const docs = await User.find(filter).select('name email status admin_role_id').sort({ name: 1, _id: 1 }).skip((req.query.page - 1) * 50).limit(50).lean();
  if (!req.query.paginated) return docs;
  const totalDocs = await User.countDocuments(filter);
  return { docs, page: req.query.page, limit: 50, totalDocs, totalPages: Math.max(1, Math.ceil(totalDocs / 50)) };
}));
roleRouter.post('/staff', requirePermission('staff.create', 'roles.assign'), body({ name: Joi.string().trim().min(1).max(100).required(), email: Joi.string().email().lowercase().required(), password: Joi.string().min(12).max(72).required(), role_id: id.required() }), endpoint(async req => {
  const password = await bcrypt.hash(req.body.password, 12);
  return transaction(async session => {
    const role = await assignableRole(req, req.body.role_id, session);
    const [user] = await User.create([{ name: req.body.name, email: req.body.email, password, role: 'staff', admin_role_id: role._id, rbac_migrated: true }], { session });
    await audit(req, session, 'RBAC_STAFF_CREATED', { role_id: role._id }, user._id);
    return { _id: user._id, name: user.name };
  });
}));
roleRouter.put('/staff/:id', requirePermission('staff.update'), params, body({ name: Joi.string().trim().min(1).max(100).required(), status: Joi.string().valid('active', 'inactive').required() }), endpoint(req => transaction(async session => {
  const user = await editableStaff(req, req.params.id, session);
  const before = { name: user.name, status: user.status };
  user.name = req.body.name; user.status = req.body.status; await user.save({ session });
  await audit(req, session, 'RBAC_STAFF_UPDATED', { before, after: req.body }, user._id);
  return { _id: user._id };
})));
roleRouter.put('/staff/:id/role', requirePermission('roles.assign'), params, body({ role_id: id.allow(null).required() }), endpoint(req => transaction(async session => {
  const user = await editableStaff(req, req.params.id, session);
  const before = user.admin_role_id;
  const role = req.body.role_id ? await assignableRole(req, req.body.role_id, session) : null;
  user.admin_role_id = role?._id || null; await user.save({ session });
  await audit(req, session, 'RBAC_ROLE_ASSIGNED', { before, after: user.admin_role_id }, user._id);
  return { _id: user._id, admin_role_id: user.admin_role_id };
})));
roleRouter.delete('/staff/:id', requirePermission('staff.delete'), params, endpoint(req => transaction(async session => {
  const user = await editableStaff(req, req.params.id, session);
  user.status = 'inactive'; user.deleted_at = new Date(); user.deleted_by = req.auth.user_id; await user.save({ session });
  await audit(req, session, 'RBAC_STAFF_UPDATED', { deleted: true }, user._id);
  return { _id: user._id };
})));
roleRouter.post('/', requirePermission('roles.create'), body(roleFields), endpoint(req => transaction(async session => {
  await validatePermissions(req, req.body.permissions, session);
  const [role] = await Role.create([{ ...req.body, key: `custom-${new mongoose.Types.ObjectId()}` }], { session });
  await audit(req, session, 'RBAC_ROLE_CREATED', { after: role.toObject() });
  return role;
})));
roleRouter.get('/:id', requirePermission('roles.view'), params, endpoint(async req => {
  const role = await Role.findOne({ _id: req.params.id, deleted_at: null }).lean();
  if (!role) throw StatusError.notFound('Role not found.');
  return role;
}));
roleRouter.put('/:id', requirePermission('roles.update'), params, body({ ...roleFields, version: Joi.number().integer().min(0).required() }), endpoint(req => transaction(async session => {
  const role = await editableRole(req, req.params.id, session);
  if (role.__v !== req.body.version) throw StatusError.conflict('Role changed; reload before saving.');
  await validatePermissions(req, req.body.permissions, session);
  const before = role.toObject();
  for (const key of Object.keys(roleFields)) role[key] = req.body[key];
  await role.save({ session });
  await audit(req, session, 'RBAC_ROLE_UPDATED', { before, after: role.toObject() });
  return role;
})));
roleRouter.post('/:id/duplicate', requirePermission('roles.create'), params, body({ name: roleFields.name }), endpoint(req => transaction(async session => {
  const source = await Role.findOne({ _id: req.params.id, deleted_at: null }).session(session);
  if (!source) throw StatusError.notFound('Role not found.');
  await validatePermissions(req, source.permissions, session);
  const [role] = await Role.create([{ name: req.body.name, key: `custom-${new mongoose.Types.ObjectId()}`, description: source.description, permissions: source.permissions }], { session });
  await audit(req, session, 'RBAC_ROLE_CREATED', { source_id: source._id, after: role.toObject() });
  return role;
})));
roleRouter.delete('/:id', requirePermission('roles.delete'), params, endpoint(req => transaction(async session => {
  const role = await editableRole(req, req.params.id, session);
  if (role.system_role) throw StatusError.forbidden('System roles cannot be deleted.');
  if (await User.exists({ admin_role_id: role._id, deleted_at: null }).session(session)) throw StatusError.conflict('Remove staff assignments before deleting this role.');
  role.deleted_at = new Date(); role.status = 'inactive'; await role.save({ session });
  await audit(req, session, 'RBAC_ROLE_DELETED', { role_id: role._id });
  return { _id: role._id };
})));
