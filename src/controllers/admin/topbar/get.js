import TopBar from "../../../models/TopBar.js";

export const get = async (req, res, next) => {
  try {
    const topBar = await TopBar.getSingleton();
    res.status(200).json({
      status: "success",
      message: req.__("Top bar fetched successfully"),
      data: topBar,
    });
  } catch (error) {
    next(error);
  }
};
