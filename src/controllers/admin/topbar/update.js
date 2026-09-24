import TopBar from "../../../models/TopBar.js";

export const update = async (req, res, next) => {
  try {
    const { announcements, contact_items, settings } = req.body;
    const topBar = await TopBar.getSingleton();
    if (announcements !== undefined) topBar.announcements = announcements;
    if (contact_items !== undefined) topBar.contact_items = contact_items;
    if (settings !== undefined) {
      const current = topBar.settings?.toObject?.() ?? topBar.settings ?? {};
      topBar.settings = { ...current, ...settings };
    }
    topBar.updated_by = req.auth.user_id;
    await topBar.save();
    res.status(200).json({
      status: "success",
      message: req.__("Top bar updated successfully"),
      data: topBar,
    });
  } catch (error) {
    next(error);
  }
};
