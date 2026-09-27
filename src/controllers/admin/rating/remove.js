import RatingResource from '../../../resources/RatingResource.js';
import { moderateRating } from '../../../services/rating/mutations.js';
export const remove = async (req, res, next) => {
  try {
    const rating = await moderateRating(req.body._id, req.auth.user_id, { deleted_at: new Date(), deleted_by: req.auth.user_id });
    res.status(200).json({ status: 'success', message: req.__('Rating Deleted successfully'), data: new RatingResource(rating).exec() });
  } catch (error) { next(error); }
};
