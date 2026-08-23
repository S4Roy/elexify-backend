import NavigationMenuItem from "../../../models/NavigationMenuItem.js";

export const list = async (req, res, next) => {
  try {
    const { menuId } = req.params;
    const items = await NavigationMenuItem.find({
      menu_id: menuId,
      deleted_at: null,
    })
      .sort({ order: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      message: req.__("Menu items fetched successfully"),
      data: items,
    });
  } catch (error) {
    next(error);
  }
};
