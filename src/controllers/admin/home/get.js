import HomePage from "../../../models/HomePage.js";

export const get = async (req, res, next) => {
  try {
    const homePage = await HomePage.getSingleton();

    res.status(200).json({
      status: "success",
      message: req.__("Homepage fetched successfully"),
      data: homePage,
    });
  } catch (error) {
    next(error);
  }
};
