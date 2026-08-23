import HomePage from "../../../models/HomePage.js";
import { homepageService } from "../../../services/index.js";

// Only ever serves `published_sections` — the draft `sections` array (and
// anything the admin hasn't published yet) never reaches this endpoint.
export const home = async (req, res, next) => {
  try {
    const homePage = await HomePage.getSingleton();

    if (homePage.status !== "published" || !homePage.published_sections?.length) {
      return res.status(200).json({
        status: "success",
        message: req.__("Homepage fetched successfully"),
        data: { sections: [], seo: homePage.seo ?? null },
      });
    }

    const plainSections = homePage.toObject().published_sections;
    const visible = homepageService.resolveVisibleSections(plainSections);
    const hydrated = await homepageService.hydrateSections(visible);

    res.status(200).json({
      status: "success",
      message: req.__("Homepage fetched successfully"),
      data: { sections: hydrated, seo: homePage.seo ?? null },
    });
  } catch (error) {
    next(error);
  }
};
