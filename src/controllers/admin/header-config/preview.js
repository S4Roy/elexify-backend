import HeaderConfig from "../../../models/HeaderConfig.js";

export const preview = async (req, res, next) => {
  try {
    const headerConfig = await HeaderConfig.getSingleton();
    res.status(200).json({
      status: "success",
      message: req.__("Header config preview fetched successfully"),
      data: headerConfig.draft,
    });
  } catch (error) {
    next(error);
  }
};
