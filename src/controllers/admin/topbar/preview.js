import TopBar from "../../../models/TopBar.js";

const isWithinSchedule = (schedule, now) => {
  if (!schedule) return true;
  const { startAt, endAt } = schedule;
  if (startAt && now < new Date(startAt)) return false;
  if (endAt && now > new Date(endAt)) return false;
  return true;
};

export const preview = async (req, res, next) => {
  try {
    const topBar = await TopBar.getSingleton();
    const plain = topBar.toObject();
    const now = new Date();
    const announcements = (plain.announcements || [])
      .filter((a) => a.enabled !== false && isWithinSchedule(a.schedule, now))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const contact_items = (plain.contact_items || [])
      .filter((c) => c.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.status(200).json({
      status: "success",
      message: req.__("Top bar preview fetched successfully"),
      data: { announcements, contact_items, status: plain.status },
    });
  } catch (error) {
    next(error);
  }
};
