import { moderateRating } from '../../../services/rating/mutations.js';
export const edit = async (req, res, next) => {
  try {
    const rating = await moderateRating(req.body._id, req.auth.user_id, { status: req.body.status });
    res.status(200).json({ status: 'success', message: req.__('Rating updated successfully'), data: rating });
  } catch (error) { next(error); }
};
