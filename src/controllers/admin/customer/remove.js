import User from '../../../models/User.js';
import { StatusError } from '../../../config/index.js';
import { revokeAll } from '../../../services/customerSession/index.js';
export const remove = async (req, res, next) => {
  try {
    const id = req.params.id || req.body._id;
    const customer = await User.findOneAndUpdate({ _id: id, role: { $in: ['customer', 'user'] }, deleted_at: null },
      { $set: { deleted_at: new Date(), deleted_by: req.auth.user_id, status: 'inactive', password_changed_at: new Date() } });
    if (!customer) throw StatusError.notFound('Customer not found');
    await revokeAll(id, req, 'ACCOUNT_DELETED');
    res.json({ status: 'success', message: 'Customer deleted successfully', data: {} });
  } catch (error) { next(error); }
};
