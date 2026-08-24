import NavigationMenu from "../../../models/NavigationMenu.js";
import NavigationMenuItem from "../../../models/NavigationMenuItem.js";
import { navigationService } from "../../../services/index.js";
import { buildShopMegaMenuContent } from "../../../services/navigation/buildShopMegaMenuContent.js";

// Industry-standard starter content for the storefront's three convention
// slugs (see menu-list.component.ts SUGGESTED_SLUGS). Only ever added to a
// menu that has zero items — an admin's existing curated menu is never
// touched — so this is safe to click repeatedly, mirroring
// scripts/seedHomePage.js's no-op-if-already-seeded behavior.
//
// "Shop" is intentionally NOT a plain /products link here — it's built at
// generation time from whatever categories exist (see the "shop_mega_menu"
// marker below), grouped the same way scripts/rebuildShopMegaMenu.js grouped
// them live. A flat /products link is a worse default once real categories
// exist, and this is exactly the gap that produced that flat link the first
// time this endpoint ran against an empty main-menu.
const SHOP_MEGA_MENU_MARKER = "shop_mega_menu";

const DEFAULT_MENUS = {
  "main-menu": {
    name: "Main Menu",
    items: [
      { label: "Home", custom_url: "/" },
      { label: "Shop", marker: SHOP_MEGA_MENU_MARKER },
      { label: "Track Order", custom_url: "/account/orders" },
      { label: "About Us", custom_url: "/page/about-us" },
      { label: "Contact Us", custom_url: "/page/contact-us" },
    ],
  },
  "mobile-menu": {
    name: "Mobile Menu",
    items: [
      { label: "Home", custom_url: "/" },
      { label: "Shop", marker: SHOP_MEGA_MENU_MARKER },
      { label: "Track Order", custom_url: "/account/orders" },
      { label: "About Us", custom_url: "/page/about-us" },
      { label: "Contact Us", custom_url: "/page/contact-us" },
    ],
  },
  "footer-menu": {
    name: "Footer Menu",
    items: [
      { label: "Privacy Policy", custom_url: "/page/privacy-policy" },
      { label: "Terms Of Use", custom_url: "/page/terms-and-conditions" },
      { label: "Refund & Return Policy", custom_url: "/page/refund-policy" },
      { label: "Shipping Policy", custom_url: "/page/shipping-policy" },
      { label: "FAQ", custom_url: "/faq" },
      { label: "Track Order", custom_url: "/account/orders" },
      { label: "Contact Us", custom_url: "/page/contact-us" },
    ],
  },
};

export const generateDefaults = async (req, res, next) => {
  try {
    const results = [];

    for (const [slug, config] of Object.entries(DEFAULT_MENUS)) {
      let menu = await NavigationMenu.findOne({ slug, deleted_at: null });

      if (!menu) {
        menu = new NavigationMenu({
          name: config.name,
          slug,
          created_by: req.auth.user_id,
          updated_by: req.auth.user_id,
        });
        await menu.save();
      }

      const existingCount = await NavigationMenuItem.countDocuments({
        menu_id: menu._id,
        deleted_at: null,
      });

      if (existingCount > 0) {
        results.push({ slug, status: "skipped", reason: "menu already has items" });
        continue;
      }

      const items = [];
      for (let i = 0; i < config.items.length; i++) {
        const it = config.items[i];
        const isShopMegaMenu = it.marker === SHOP_MEGA_MENU_MARKER;
        const type = isShopMegaMenu ? "mega_menu" : "custom_url";
        const custom_url = isShopMegaMenu ? null : it.custom_url;
        const mega_menu_content = isShopMegaMenu ? await buildShopMegaMenuContent() : null;

        const snapshot = {
          label: it.label,
          type,
          icon: null,
          badge: null,
          reference_id: null,
          reference_model: null,
          custom_url,
          target: "_self",
          order: i,
          enabled: true,
          schedule: null,
          mega_menu_content,
          parent_id: null,
        };
        items.push(
          new NavigationMenuItem({
            menu_id: menu._id,
            type,
            label: it.label,
            custom_url,
            mega_menu_content,
            order: i,
            enabled: true,
            is_published: true,
            published_snapshot: snapshot,
            created_by: req.auth.user_id,
            updated_by: req.auth.user_id,
          }),
        );
      }
      await NavigationMenuItem.insertMany(items);

      menu.status = "published";
      menu.published_at = new Date();
      menu.updated_by = req.auth.user_id;
      await menu.save();

      results.push({ slug, status: "created", items: items.length });
    }

    navigationService.invalidate();

    res.status(200).json({
      status: "success",
      message: req.__("Default menus generated successfully"),
      data: results,
    });
  } catch (error) {
    next(error);
  }
};
