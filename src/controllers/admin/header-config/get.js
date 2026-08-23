import HeaderConfig from "../../../models/HeaderConfig.js";

export const get = async (req, res, next) => {
  try {
    const headerConfig = await HeaderConfig.getSingleton();
    res.status(200).json({
      status: "success",
      message: req.__("Header config fetched successfully"),
      data: headerConfig,
    });
  } catch (error) {
    next(error);
  }
};
