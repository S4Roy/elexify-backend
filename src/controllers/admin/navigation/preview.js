import TopBar from "../../../models/TopBar.js";
import HeaderConfig from "../../../models/HeaderConfig.js";
import NavigationMenu from "../../../models/NavigationMenu.js";
import NavigationMenuItem from "../../../models/NavigationMenuItem.js";
import { navigationService } from "../../../services/index.js";

const isWithinSchedule = (schedule, now) => {
  if (!schedule) return true;
  const { startAt, endAt } = schedule;
  if (startAt && now < new Date(startAt)) return false;
  if (endAt && now > new Date(endAt)) return false;
  return true;
};

const sortByOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

const buildDraftTopbar = (topBar) => {
  const now = new Date();
  const announcements = (topBar.announcements || [])
    .filter((a) => a.enabled !== false && isWithinSchedule(a.schedule, now))
    .sort(sortByOrder);
  const contact_items = (topBar.contact_items || [])
    .filter((c) => c.enabled !== false)
    .sort(sortByOrder);
  return { announcements, contact_items };
};

const buildDraftMenu = async (menu) => {
  const items = await NavigationMenuItem.find({
    menu_id: menu._id,
    deleted_at: null,
  }).lean();
  const tree = navigationService.resolveVisibleMenuTree(items, {
    source: "draft",
  });
  return navigationService.hydrateMenuTree(tree);
};

/**
 * Combined admin-preview aggregate: draft topbar + draft header settings +
 * draft tree for every non-deleted menu, keyed by slug. Mirrors the shape of
 * getPublicNavigationConfig() but built from draft fields, for the Phase C
 * admin-preview iframe route to fetch in one call.
 */
export const preview = async (req, res, next) => {
  try {
    const [topBarDoc, headerConfigDoc, menus] = await Promise.all([
      TopBar.getSingleton(),
      HeaderConfig.getSingleton(),
      NavigationMenu.find({ deleted_at: null }).lean(),
    ]);

    const topBar = topBarDoc.toObject();
    const headerConfig = headerConfigDoc.toObject();

    const menusBySlug = {};
    for (const menu of menus) {
      menusBySlug[menu.slug] = await buildDraftMenu(menu);
    }

    const data = {
      topbar: buildDraftTopbar(topBar),
      header: headerConfig.draft || {},
      menus: menusBySlug,
    };

    res.status(200).json({
      status: "success",
      message: req.__("Navigation preview fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
