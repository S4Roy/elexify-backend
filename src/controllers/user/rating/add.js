import { saveRating } from '../../../services/rating/mutations.js';
import { StatusError } from '../../../config/StatusErrors.js';

export const add = async (req, res, next) => {
  try {
    const { review, created } = await saveRating(req.auth.user_id, req.body);
    res.status(created ? 201 : 200).json({
      message: created ? 'Rating added successfully' : 'Rating updated successfully', data: review,
    });
  } catch (error) {
    next(error.code === 11000 ? StatusError.conflict('Review already exists; please retry your update') : error);
  }
};
