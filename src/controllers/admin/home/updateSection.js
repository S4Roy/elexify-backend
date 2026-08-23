import HomePage from "../../../models/HomePage.js";
import { StatusError } from "../../../config/index.js";
import { homepageService } from "../../../services/index.js";

export const updateSection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, subtitle, enabled, order, config, schedule } = req.body;

    const homePage = await HomePage.getSingleton();
    const section = homePage.sections.id(id);
    if (!section) {
      throw StatusError.notFound(req.__("Section not found"));
    }

    if (config !== undefined) {
      let cleanConfig;
      try {
        cleanConfig = homepageService.validateSectionConfig(section.type, config);
      } catch (validationError) {
        throw StatusError.badRequest(validationError.message);
      }
      await homepageService.assertSectionReferencesExist(section.type, cleanConfig);
      section.config = cleanConfig;
    }

    if (title !== undefined) section.title = title;
    if (subtitle !== undefined) section.subtitle = subtitle;
    if (enabled !== undefined) section.enabled = enabled;
    if (order !== undefined) section.order = order;
    if (schedule !== undefined) {
      section.schedule = {
        startAt: schedule?.startAt ?? null,
        endAt: schedule?.endAt ?? null,
      };
    }

    homePage.updated_by = req.auth.user_id;
    await homePage.save();

    res.status(200).json({
      status: "success",
      message: req.__("Section updated successfully"),
      data: homePage,
    });
  } catch (error) {
    next(error);
  }
};
