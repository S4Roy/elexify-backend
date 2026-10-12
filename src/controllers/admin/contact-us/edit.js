import ContactUs from "../../../models/ContactUs.js";
import { StatusError } from "../../../config/index.js";
import { authorName } from './thread.js';

/**
 * Update ContactUs status or other fields
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, status, priority } = req.body;

    // Find existing rating
    const rating = await ContactUs.findOne({ _id, deleted_at: null });
    if (!rating) {
      throw StatusError.notFound(req.__("ContactUs not found"));
    }

    // Prepare update data
    const updateData = {
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      updated_at: new Date(),
      updated_by: req.auth?.user_id || null,
    };

    const changes = [];
    if (status !== undefined && status !== rating.status) changes.push(`Status changed from ${rating.status} to ${status}.`);
    if (priority !== undefined && priority !== (rating.priority || 'normal')) changes.push(`Priority changed from ${rating.priority || 'normal'} to ${priority}.`);
    const updatedRating = await ContactUs.findOneAndUpdate(
      { _id, deleted_at: null, status: rating.status, updated_at: rating.updated_at },
      { $set: updateData, ...(changes.length && { $push: { notes: {
        kind: 'activity', content: changes.join(' '), added_by: req.auth.user_id,
        author_name: await authorName(req), created_at: new Date(),
      } } }) },
      { new: true }
    );
    if (!updatedRating) throw StatusError.conflict('This enquiry changed. Refresh it before saving.');

    res.status(200).json({
      status: "success",
      message: req.__("ContactUs updated successfully"),
      data: updatedRating,
    });
  } catch (error) {
    next(error);
  }
};
