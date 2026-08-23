import { navigationService } from "../../../services/index.js";

export const get = async (req, res, next) => {
  try {
    const data = await navigationService.getPublicNavigationConfig();
    res.status(200).json({
      status: "success",
      message: req.__("Navigation config fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
