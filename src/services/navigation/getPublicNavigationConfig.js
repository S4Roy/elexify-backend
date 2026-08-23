import TopBar from "../../models/TopBar.js";
import HeaderConfig from "../../models/HeaderConfig.js";
import NavigationMenu from "../../models/NavigationMenu.js";
import NavigationMenuItem from "../../models/NavigationMenuItem.js";
import Media from "../../models/Media.js";
import MediaResource from "../../resources/MediaResource.js";
import { resolveVisibleMenuTree } from "./resolveVisibleMenuTree.js";
import { hydrateMenuTree } from "./hydrateMenuTree.js";
import { cacheGet, cacheSet } from "./navigationCache.js";

const CACHE_KEY = "site:navigation:config";
const MENU_SLUGS = ["main-menu", "mobile-menu", "footer-menu"];

const isWithinSchedule = (schedule, now) => {
  if (!schedule) return true;
  const { startAt, endAt } = schedule;
  if (startAt && now < new Date(startAt)) return false;
  if (endAt && now > new Date(endAt)) return false;
  return true;
};

const resolveTopBar = (topBar) => {
  const now = new Date();
  const announcements = (topBar.published_announcements || [])
    .filter((a) => a.enabled && isWithinSchedule(a.schedule, now))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const contactItems = (topBar.published_contact_items || [])
    .filter((c) => c.enabled)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { announcements, contact_items: contactItems };
};

const resolveHeaderConfig = async (headerConfig) => {
  const cfg = headerConfig.toObject().published || {};
  const resolveLogo = async (logo) => {
    if (!logo?.image) return { ...logo, image: null };
    const mediaDoc = await Media.findById(logo.image);
    return { ...logo, image: mediaDoc ? new MediaResource(mediaDoc).exec() : null };
  };
  return {
    ...cfg,
    logo: await resolveLogo(cfg.logo),
    logo_mobile: await resolveLogo(cfg.logo_mobile),
  };
};

const buildMenu = async (slug) => {
  const menu = await NavigationMenu.findOne({ slug, deleted_at: null, status: "published" }).lean();
  if (!menu) return [];

  const items = await NavigationMenuItem.find({
    menu_id: menu._id,
    deleted_at: null,
    is_published: true,
  }).lean();

  const visibleTree = resolveVisibleMenuTree(items, { source: "published" });
  return hydrateMenuTree(visibleTree);
};

export const getPublicNavigationConfig = async () => {
  const cached = cacheGet(CACHE_KEY);
  if (cached) return cached;

  const [topBar, headerConfig, ...menus] = await Promise.all([
    TopBar.getSingleton(),
    HeaderConfig.getSingleton(),
    ...MENU_SLUGS.map(buildMenu),
  ]);

  const data = {
    topbar: topBar.status === "published" ? resolveTopBar(topBar) : { announcements: [], contact_items: [] },
    header: headerConfig.status === "published" ? await resolveHeaderConfig(headerConfig) : {},
    menus: MENU_SLUGS.reduce((acc, slug, i) => ({ ...acc, [slug]: menus[i] }), {}),
  };

  cacheSet(CACHE_KEY, data);
  return data;
};
