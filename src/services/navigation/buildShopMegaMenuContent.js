import Category from "../../models/Category.js";

// Column grouping is an editorial call based on this store's category names
// — an admin can rearrange columns/links later via the menu builder. Any
// active category not listed here just falls into a trailing "More" column
// instead of being silently dropped.
const COLUMNS = [
  {
    heading: "Boards & Cabinets",
    slugs: [
      "audio-boards",
      "avr-boards",
      "amplifier-power-supply-boards",
      "smps-boards",
      "amplifier-cabinets",
      "inverter-cabinets",
    ],
  },
  {
    heading: "Components",
    slugs: [
      "capacitors-polar",
      "capacitors-non-polar",
      "resistor",
      "transistors-mosfets",
      "ic-integrated-circuit",
      "voltage-regulator-ic",
    ],
  },
  {
    heading: "Power & Energy",
    slugs: ["transformers", "lithium-battery", "inverter-kit", "e-bike"],
  },
  {
    heading: "Audio, Tools & Accessories",
    slugs: ["speakers", "home-audio", "connectors", "wires-cables", "switch-gear", "nut-square", "tools"],
  },
];

// Builds a `mega_menu_content` grouping every active category into
// industry-standard columns, resolved against the live `categories`
// collection (never a stale export) so a link can never dangle.
export const buildShopMegaMenuContent = async () => {
  const categories = await Category.find({ deleted_at: null, status: "active" })
    .select("_id name slug")
    .lean();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const seededSlugs = new Set();

  const columns = COLUMNS.map((col, colIdx) => ({
    heading: col.heading,
    order: colIdx,
    links: col.slugs
      .map((slug, linkIdx) => {
        const cat = bySlug.get(slug);
        if (!cat) return null;
        seededSlugs.add(slug);
        return {
          label: cat.name,
          type: "category",
          reference_id: cat._id,
          custom_url: null,
          order: linkIdx,
          badge: { text: null, color: null },
        };
      })
      .filter(Boolean),
  }));

  const leftover = categories.filter((c) => !seededSlugs.has(c.slug));
  if (leftover.length) {
    columns.push({
      heading: "More",
      order: columns.length,
      links: leftover.map((cat, linkIdx) => ({
        label: cat.name,
        type: "category",
        reference_id: cat._id,
        custom_url: null,
        order: linkIdx,
        badge: { text: null, color: null },
      })),
    });
  }

  return { layout: "columns", columns, promo: null };
};
