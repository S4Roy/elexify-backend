import HomePage from "../../../models/HomePage.js";
import { StatusError } from "../../../config/index.js";

// Body: { order: [sectionId, sectionId, ...] } — the new top-to-bottom order.
export const reorder = async (req, res, next) => {
  try {
    const { order = [] } = req.body;

    const homePage = await HomePage.getSingleton();
    const existingIds = new Set(homePage.sections.map((s) => String(s._id)));
    const incomingIds = order.map(String);

    if (
      incomingIds.length !== existingIds.size ||
      !incomingIds.every((id) => existingIds.has(id))
    ) {
      throw StatusError.badRequest(
        req.__("Reorder list must include every existing section exactly once"),
      );
    }

    incomingIds.forEach((id, index) => {
      const section = homePage.sections.id(id);
      section.order = index;
    });

    homePage.updated_by = req.auth.user_id;
    await homePage.save();

    res.status(200).json({
      status: "success",
      message: req.__("Sections reordered successfully"),
      data: homePage,
    });
  } catch (error) {
    next(error);
  }
};
