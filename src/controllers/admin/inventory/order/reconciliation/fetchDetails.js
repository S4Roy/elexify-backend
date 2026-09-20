import { StatusError } from '../../../../../config/index.js';
import Audit from '../../../../../models/ShiprocketReconciliationAudit.js';
import { fetchImportedShiprocketDetails } from '../../../../../services/orderService/fetchImportedShiprocketDetails.js';

export const fetchDetails = async (req, res, next) => {
  let claimed;
  try {
    claimed = await Audit.findOneAndUpdate({ _id: req.body.audit_id, mode: 'force_status', status: 'applied', details_processing: { $ne: true } }, { $set: { details_processing: true } }, { new: true });
    if (!claimed) throw StatusError.conflict('Finish applying the force import first, or wait for its details sync to finish.');
    const successful = new Set(claimed.outcomes.filter(item => item.status === 'synced').map(item => item.reference));
    const candidates = claimed.candidates.filter(item => successful.has(item.reference));
    const cursor = claimed.details_cursor || 0;
    const candidate = candidates[cursor];
    let outcome;
    if (candidate) {
      try {
        const details = await fetchImportedShiprocketDetails({ candidate, rows: claimed.rows, adminId: req.auth.user_id });
        outcome = { reference: candidate.reference, status: 'synced', ...details };
      } catch (error) {
        outcome = { reference: candidate.reference, status: 'blocked', reason: error.message };
      }
    }
    const processed = cursor + (candidate ? 1 : 0);
    await Audit.updateOne({ _id: claimed._id }, { $set: { details_processing: false, details_cursor: processed }, ...(outcome ? { $push: { details_outcomes: outcome } } : {}) });
    claimed = null;
    return res.status(200).json({ status: 'success', data: { cursor: processed, total: candidates.length, done: processed >= candidates.length, outcome } });
  } catch (error) {
    if (claimed) await Audit.updateOne({ _id: claimed._id }, { $set: { details_processing: false } }).catch(() => {});
    next(error);
  }
};
