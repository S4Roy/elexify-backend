import Wishlist from "../../../../models/Wishlist.js";
import Cart from "../../../../models/Cart.js";
import { StatusError } from "../../../../config/index.js";
import Category from "../../../../models/Category.js";
import Brand from "../../../../models/Brand.js";
import Attribute from "../../../../models/Attribute.js";
import AttributeResource from "../../../../resources/AttributeResource.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import CategoryResource from "../../../../resources/CategoryResource.js";
/**
 * Get wishlist and cart counts for user or guest
 */
export const filterOption = async (req, res, next) => {
  try {
    let data = {
      categories: [],
      brands: [],
      attributes: [],
    };
    // ✅ Get all categories (non-deleted)
    const categories = await Category.find({
      deleted_at: null,
      status: "active",
    })
      .sort({ sort_order: 1 })
      .select("name slug parent_category")
      .lean();

    // Build a map
    const categoryMap = {};
    categories.forEach((cat) => {
      cat.childrens = [];
      categoryMap[cat._id] = cat;
    });

    // Build tree
    const tree = [];
    categories.forEach((cat) => {
      if (cat.parent_category) {
        categoryMap[cat.parent_category]?.childrens.push(cat);
      } else {
        tree.push(cat); // root categories
      }
    });

    data.categories = tree;

    let attribute = await Attribute.aggregatePaginate(
      Attribute.aggregate([
        { $match: { deleted_at: null, status: "active" } },
        {
          $lookup: {
            from: "attribute_values",
            let: { attrId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$attribute_id", "$$attrId"] },
                      { $eq: ["$deleted_at", null] },
                      { $eq: ["$status", "active"] },
                    ],
                  },
                },
              },
              // Optional: sort values
              { $sort: { created_at: -1 } },
              // Optional: project only what you need
              {
                $project: {
                  _id: 1,
                  value: 1,
                  slug: 1,
                  description: 1,
                  status: 1,
                },
              },
            ],
            as: "values",
          },
        },

        {
          $lookup: {
            from: "medias",
            localField: "image",
            foreignField: "_id",
            as: "image",
          },
        },
        {
          $unwind: {
            path: "$image",
            preserveNullAndEmptyArrays: true,
          },
        },
      ]),
      { sort: { created_at: -1 } }
    );

    data.attributes = await AttributeResource.collection(attribute.docs);

    return res.status(200).json({
      status: "success",
      message: "Filter retrieved",
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
