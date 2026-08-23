import HomePage from "../../../models/HomePage.js";
import { StatusError } from "../../../config/index.js";

export const removeSection = async (req, res, next) => {
  try {
    const { id } = req.params;

    const homePage = await HomePage.getSingleton();
    const section = homePage.sections.id(id);
    if (!section) {
      throw StatusError.notFound(req.__("Section not found"));
    }

    homePage.sections.pull({ _id: id });
    homePage.updated_by = req.auth.user_id;
    await homePage.save();

    res.status(200).json({
      status: "success",
      message: req.__("Section removed successfully"),
      data: homePage,
    });
  } catch (error) {
    next(error);
  }
};
