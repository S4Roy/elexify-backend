import SEO from "../../models/SEO.js";
import Product from "../../models/Product.js";

const buildDuplicateSet = async (field) => {
  const groups = await SEO.aggregate([
    { $match: { reference_type: "products", [field]: { $nin: [null, ""] } } },
    {
      $group: {
        _id: { $toLower: { $trim: { input: `$${field}` } } },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
  return new Set(groups.map((g) => g._id));
};

export const findDuplicateTitleSet = () => buildDuplicateSet("meta_title");
export const findDuplicateDescriptionSet = () => buildDuplicateSet("meta_description");

export const isTitleDuplicate = async (seoId, title) => {
  if (!title) return false;
  const count = await SEO.countDocuments({
    reference_type: "products",
    _id: { $ne: seoId },
    $expr: {
      $eq: [{ $toLower: { $trim: { input: "$meta_title" } } }, title.trim().toLowerCase()],
    },
  });
  return count > 0;
};

export const isDescriptionDuplicate = async (seoId, description) => {
  if (!description) return false;
  const count = await SEO.countDocuments({
    reference_type: "products",
    _id: { $ne: seoId },
    $expr: {
      $eq: [{ $toLower: { $trim: { input: "$meta_description" } } }, description.trim().toLowerCase()],
    },
  });
  return count > 0;
};

// Structurally shouldn't happen given Product's unique slug index — kept for
// completeness/defensiveness per the duplicate-detection requirement.
export const findDuplicateSlugs = async () => {
  return Product.aggregate([
    { $match: { deleted_at: null } },
    { $group: { _id: "$slug", count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
  ]);
};
