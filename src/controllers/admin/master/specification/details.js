import Specification from "../../../../models/Specification.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import SpecificationResource from "../../../../resources/SpecificationResource.js";
import mongoose from "mongoose";

/**
 * Add Specification
 * @param req
 * @param res
 * @param next
 */
export const details = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
    } = req.query;
    const { slug = null } = req.params;
    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };

    let matchFilter = { deleted_at: null };
    // Find the main category by slug
    const CategoryDetails = await Specification.findOne({
      slug,
      deleted_at: null,
    }).exec();

    if (!CategoryDetails) {
      throw StatusError.notFound(req.__("Specification not found"));
    }

    if (CategoryDetails?.parent_classification) {
      // If the category has a parent, fetch its subcategories
      matchFilter.parent_classification = new mongoose.Types.ObjectId(
        CategoryDetails._id
      );
    } else {
      // If it's a main category, fetch all its subcategories
      matchFilter.parent_classification = CategoryDetails._id;
    }
    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { slug: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: "classifications",
          localField: "parent_classification",
          foreignField: "_id",
          as: "parent_classification",
        },
      },
      {
        $unwind: {
          path: "$parent_classification",
          preserveNullAndEmptyArrays: true,
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
    ];

    const data = await Specification.aggregatePaginate(
      Specification.aggregate(pipeline),
      options
    );

    data.docs = await SpecificationResource.collection(data.docs);
    res.status(201).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
