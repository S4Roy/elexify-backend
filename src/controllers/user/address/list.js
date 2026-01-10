import Address from "../../../models/Address.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import AddressResource from "../../../resources/AddressResource.js";
import mongoose from "mongoose";

/**
 * Add Address
 * @param req
 * @param res
 * @param next
 */
export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
      parent_category = null,
    } = req.query;
    const { _id = null } = req.params;
    const user_id = req.auth?.user_id || null;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };
    let matchFilter = {
      deleted_at: null,
      user: new mongoose.Types.ObjectId(user_id),
    };

    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: "countries",
          localField: "country",
          foreignField: "id",
          as: "country",
        },
      },
      {
        $unwind: {
          path: "$country",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "states",
          localField: "state",
          foreignField: "id",
          as: "state",
        },
      },
      {
        $unwind: {
          path: "$state",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "cities",
          localField: "city",
          foreignField: "id",
          as: "city",
        },
      },
      {
        $unwind: {
          path: "$city",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
    let data;

    if (_id) {
      // Fetch a single product by _id
      data = await Address.aggregate(pipeline);

      if (!data.length) {
        throw StatusError.notFound(req.__("Address not found"));
      }

      data = new AddressResource(data[0]).exec();
    } else {
      data = await Address.aggregatePaginate(
        Address.aggregate(pipeline),
        options
      );

      data.docs = await AddressResource.collection(data.docs);
    }
    res.status(201).json({
      status: "success",
      message: req.__(`${_id ? "Details" : "List"} fetched successfully`),
      data: data,
    });
  } catch (error) {
    next(error);
  }
};
