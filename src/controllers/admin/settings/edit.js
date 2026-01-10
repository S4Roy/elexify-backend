import SiteSetting from "../../../models/SiteSetting.js";
import { StatusError } from "../../../config/index.js";

/**
 * Update SiteSetting by slug
 */
export const edit = async (req, res, next) => {
  try {
    const { slug, value } = req.body;

    if (!slug) {
      throw StatusError.badRequest(req.__("Slug is required"));
    }

    // Find existing setting by slug
    const existing = await SiteSetting.findOne({ slug });
    if (!existing) {
      throw StatusError.notFound(req.__("Site Setting not found"));
    }

    // Whitelist fields that are allowed to be updated via this endpoint
    const updatePayload = { value: value };

    // Always set audit fields
    updatePayload.updated_at = new Date();
    updatePayload.updated_by = req.auth?.user_id ?? null;

    // If nothing to update besides audit fields, still allow updating (or optionally return 400)
    // Update and return the updated document
    const updatedSetting = await SiteSetting.findOneAndUpdate(
      { slug },
      { $set: updatePayload },
      { new: true, runValidators: true } // runValidators ensures mongoose schema validation runs
    ).lean();

    res.status(200).json({
      status: "success",
      message: req.__("SiteSetting updated successfully"),
      data: updatedSetting,
    });
  } catch (error) {
    next(error);
  }
};
