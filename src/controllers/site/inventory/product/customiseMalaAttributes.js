import Wishlist from "../../../../models/Wishlist.js";
import Cart from "../../../../models/Cart.js";
import { StatusError } from "../../../../config/index.js";
import Category from "../../../../models/Category.js";
import Brand from "../../../../models/Brand.js";
import Attribute from "../../../../models/Attribute.js";
import AttributeValue from "../../../../models/AttributeValue.js";
import AttributeResource from "../../../../resources/AttributeResource.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import ExchangeRate from "../../../../models/ExchangeRate.js";
import CategoryResource from "../../../../resources/CategoryResource.js";
import AttributeValueResource from "../../../../resources/AttributeValueResource.js";
/**
 * Get wishlist and cart counts for user or guest
 */
export const customiseMalaAttributes = async (req, res, next) => {
  try {
    let data = {
      attributes: [],
      mukhi_values: [],
      design_values: [],
      type_values: [],
    };

    let attribute = await Attribute.aggregatePaginate(
      Attribute.aggregate([
        {
          $match: {
            deleted_at: null,
            status: "active",
            customized_mala_mukhi: true,
          },
        },
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
                  meta: 1,
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

    let mukhiValues = await AttributeValue.find({
      attribute_id: { $in: attribute.docs.map((attr) => attr._id) },
      deleted_at: null,
      status: "active",
    }).sort({ sort_order: 1, created_at: 1 });
    const designValues = await AttributeValue.find({
      attribute_id: await (async () => {
        const attr = await Attribute.findOne({
          customized_mala_design: true,
          deleted_at: null,
        }).select("_id");
        return attr ? attr._id : null;
      })(),
      deleted_at: null,
      status: "active",
    })
      .populate("image")
      .sort({ sort_order: 1, created_at: 1 });
    const typeValues = await AttributeValue.find({
      attribute_id: await (async () => {
        const attr = await Attribute.findOne({
          customized_mala_type: true,
          deleted_at: null,
        }).select("_id");
        return attr ? attr._id : null;
      })(),
      deleted_at: null,
      status: "active",
    }).sort({ sort_order: 1, created_at: 1 });
    data.attributes = await AttributeResource.collection(attribute.docs);
    data.mukhi_values = await AttributeValueResource.collection(mukhiValues);
    data.design_values = await AttributeValueResource.collection(designValues);
    data.type_values = await AttributeValueResource.collection(typeValues);

    return res.status(200).json({
      status: "success",
      message: "Filter retrieved",
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
