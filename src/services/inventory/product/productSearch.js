// Admin catalog search: name/slug/SKU contain the text (case-insensitive) and an
// HSN code matches as a prefix, so "8543" finds every product filed under that
// heading. Variation SKUs and HSN codes count too. Exact code matches rank first.
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizeSearchKey = (value) => String(value ?? "").trim().slice(0, 100);

export const productSearchMatch = (searchKey) => {
  const text = normalizeSearchKey(searchKey);
  if (!text) return null;
  const contains = { $regex: escapeRegex(text), $options: "i" };
  const conditions = [
    { name: contains },
    { slug: contains },
    { sku: contains },
    { variations: { $elemMatch: { sku: contains } } },
  ];
  const digits = text.replace(/\s+/g, "");
  if (/^\d{2,8}$/.test(digits)) {
    const prefix = { $regex: `^${digits}` };
    conditions.push({ hsn_sac: prefix }, { variations: { $elemMatch: { hsn_sac: prefix } } });
  }
  return { $or: conditions };
};

// 2: SKU or HSN equals the search; 1: SKU or name starts with it; 0: anything else.
export const searchRankStage = (searchKey) => {
  const text = normalizeSearchKey(searchKey).toLowerCase();
  if (!text) return null;
  const lower = (expr) => ({ $toLower: { $ifNull: [expr, ""] } });
  const variationSkus = { $map: { input: { $ifNull: ["$variations", []] }, as: "v", in: lower("$$v.sku") } };
  const variationHsns = { $map: { input: { $ifNull: ["$variations", []] }, as: "v", in: { $ifNull: ["$$v.hsn_sac", ""] } } };
  const startsWith = (expr) => ({ $eq: [{ $indexOfCP: [expr, text] }, 0] });
  return {
    $addFields: {
      search_rank: {
        $switch: {
          branches: [
            {
              case: {
                $or: [
                  { $eq: [lower("$sku"), text] },
                  { $in: [text, variationSkus] },
                  { $eq: [{ $ifNull: ["$hsn_sac", ""] }, text] },
                  { $in: [text, variationHsns] },
                ],
              },
              then: 2,
            },
            { case: { $or: [startsWith(lower("$sku")), startsWith(lower("$name"))] }, then: 1 },
          ],
          default: 0,
        },
      },
    },
  };
};

// "missing": at least one sellable item would ship without an HSN code — a simple
// product without one, or a variable product where a variation has none of its
// own and the product has none to fall back on. "present" is the opposite.
export const hsnStatusMatch = (status) => {
  if (status !== "missing" && status !== "present") return null;
  const blank = (expr) => ({ $in: [{ $ifNull: [expr, ""] }, ["", null]] });
  const missing = {
    $and: [
      blank("$hsn_sac"),
      {
        $or: [
          { $ne: ["$type", "variable"] },
          { $eq: [{ $size: { $ifNull: ["$variations", []] } }, 0] },
          { $anyElementTrue: [{ $map: { input: "$variations", as: "v", in: blank("$$v.hsn_sac") } }] },
        ],
      },
    ],
  };
  return { $expr: status === "missing" ? missing : { $not: [missing] } };
};
