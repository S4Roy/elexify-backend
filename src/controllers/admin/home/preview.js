import HomePage from "../../../models/HomePage.js";
import { homepageService } from "../../../services/index.js";

// Draft sections, filtered exactly the way the public endpoint filters
// `published_sections` — "what would be live right now if you published".
export const preview = async (req, res, next) => {
  try {
    const homePage = await HomePage.getSingleton();
    const plainSections = homePage.toObject().sections;

    const visible = homepageService.resolveVisibleSections(plainSections);
    const hydrated = await homepageService.hydrateSections(visible);

    res.status(200).json({
      status: "success",
      message: req.__("Homepage preview fetched successfully"),
      data: { sections: hydrated, seo: homePage.seo, status: homePage.status },
    });
  } catch (error) {
    next(error);
  }
};
