import SiteSetting from "../../../models/SiteSetting.js";

/**
 * SiteSetting List
 * @param req
 * @param res
 * @param next
 */
export const list = async (req, res, next) => {
  try {
    const data = await SiteSetting.find().sort({ type: -1 }).exec();

    res.status(201).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
