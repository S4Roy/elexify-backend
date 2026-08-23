import HeaderConfig from "../../../models/HeaderConfig.js";

export const update = async (req, res, next) => {
  try {
    const headerConfig = await HeaderConfig.getSingleton();
    headerConfig.draft = req.body;
    headerConfig.updated_by = req.auth.user_id;
    await headerConfig.save();
    res.status(200).json({
      status: "success",
      message: req.__("Header config updated successfully"),
      data: headerConfig,
    });
  } catch (error) {
    next(error);
  }
};
