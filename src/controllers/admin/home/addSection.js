import HomePage from "../../../models/HomePage.js";
import { StatusError } from "../../../config/index.js";
import { homepageService } from "../../../services/index.js";

export const addSection = async (req, res, next) => {
  try {
    const {
      type,
      title = null,
      subtitle = null,
      enabled = true,
      order,
      config = {},
      schedule = {},
    } = req.body;

    if (!homepageService.SECTION_TYPES.includes(type)) {
      throw StatusError.badRequest(req.__("Invalid section type"));
    }

    let cleanConfig;
    try {
      cleanConfig = homepageService.validateSectionConfig(type, config);
    } catch (validationError) {
      throw StatusError.badRequest(validationError.message);
    }
    await homepageService.assertSectionReferencesExist(type, cleanConfig);

    const homePage = await HomePage.getSingleton();
    const maxOrder = homePage.sections.reduce(
      (max, s) => Math.max(max, s.order ?? 0),
      -1,
    );

    homePage.sections.push({
      type,
      title,
      subtitle,
      enabled,
      order: order ?? maxOrder + 1,
      config: cleanConfig,
      schedule: {
        startAt: schedule?.startAt ?? null,
        endAt: schedule?.endAt ?? null,
      },
    });
    homePage.updated_by = req.auth.user_id;
    await homePage.save();

    res.status(201).json({
      status: "success",
      message: req.__("Section added successfully"),
      data: homePage,
    });
  } catch (error) {
    next(error);
  }
};
