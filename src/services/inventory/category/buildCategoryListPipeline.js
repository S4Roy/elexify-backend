import mongoose from 'mongoose';
import Category from '../../../models/Category.js';

export const buildCategoryListPipeline = async (query = {}, slug = null) => {
  const { id_includes = '', search_key = '', parent_category = null, slug: querySlug = null, type = null, status = null } = query;
    let matchFilter = { deleted_at: null };
    if (slug) {
      matchFilter.slug = slug;
    }
    if (status) {
      matchFilter.status = { $in: status.split(",") };
    }
    let idsArray = [];

    if (typeof id_includes === "string") {
      idsArray = id_includes
        .split(",")
        .map((id) => id.trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    }

    if (idsArray.length) {
      matchFilter._id = { $in: idsArray };
    }
    if (querySlug) {
      let existingCategory = await Category.findOne({ slug: querySlug }).exec();
      if (existingCategory) matchFilter.parent_category = existingCategory._id;
      else matchFilter._id = { $in: [] };
    }
    if (parent_category && mongoose.Types.ObjectId.isValid(parent_category)) {
      matchFilter.parent_category = new mongoose.Types.ObjectId(
        parent_category
      );
    } else {
      // matchFilter.parent_category = null;
    }

    // if (search_key) {
    //   matchFilter.$or = [
    //     { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
    //     { slug: { $regex: ".*" + search_key + ".*", $options: "i" } },
    //   ];
    // }

    const pipeline = [
      { $match: matchFilter },

      // parent_category populate
      {
        $lookup: {
          from: "categories",
          localField: "parent_category",
          foreignField: "_id",
          as: "parent_category",
        },
      },
      {
        $unwind: {
          path: "$parent_category",
          preserveNullAndEmptyArrays: true,
        },
      },

      // top-level image
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

      // top-level banner
      {
        $lookup: {
          from: "medias",
          localField: "banner",
          foreignField: "_id",
          as: "banner",
        },
      },
      {
        $unwind: {
          path: "$banner",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Count child categories
      {
        $lookup: {
          from: "products",
          let: { categoryId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $in: ["$$categoryId", "$categories"] },
                    { $in: ["$$categoryId", "$sub_categories"] },
                  ],
                },
                deleted_at: null,
              },
            },
            { $count: "count" },
          ],
          as: "child_count_data",
        },
      },
      {
        $addFields: {
          products: {
            $cond: [
              { $gt: [{ $size: "$child_count_data" }, 0] },
              { $arrayElemAt: ["$child_count_data.count", 0] },
              0,
            ],
          },
        },
      },
      {
        $project: {
          child_count_data: 0,
        },
      },
    ];
    if (type == "parent") {
      // matchFilter.parent_category = null;
      pipeline.push({ $match: { parent_category: null } });
    }
    if (type == "sub") {
      // matchFilter.parent_category = { $ne: null };
      pipeline.push({ $match: { parent_category: { $ne: null } } });
    }
    if (search_key) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search_key, $options: "i" } },
            { slug: { $regex: search_key, $options: "i" } },
            // match if any variation has a sku that matches
            {
              "parent_category.name": { $regex: search_key, $options: "i" },
            },
          ],
        },
      });
    }

  return { pipeline, matchFilter };
};
