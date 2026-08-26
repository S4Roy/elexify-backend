import Pincode from "../../../models/Pincode.js";
import { envs } from "../../../config/index.js";

/**
 * Pincode List — the "Serviceability" admin screen. Search by pincode /
 * district, filter by status (active = serviceable, inactive = excluded)
 * and by state.
 */
export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "pincode",
      sort_order = 1,
      status = null,
      state_id = null,
    } = req.query;

    const options = {
      page: page,
      limit: limit,
      sort: { [sort_by]: sort_order },
    };

    let matchFilter = {};
    if (search_key) {
      matchFilter.$or = [
        { pincode: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { district: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }
    if (status) {
      matchFilter.status = { $in: status.split(",") };
    }
    if (state_id) {
      matchFilter.state_id = Number(state_id);
    }

    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: "cities",
          localField: "city_id",
          foreignField: "id",
          as: "city",
        },
      },
      { $unwind: { path: "$city", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "states",
          localField: "state_id",
          foreignField: "id",
          as: "state",
        },
      },
      { $unwind: { path: "$state", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          pincode: 1,
          district: 1,
          status: 1,
          note: 1,
          "city.id": 1,
          "city.name": 1,
          "state.id": 1,
          "state.name": 1,
          created_at: 1,
          updated_at: 1,
        },
      },
    ];

    const data = await Pincode.aggregatePaginate(Pincode.aggregate(pipeline), options);

    res.status(200).json({
      status: "success",
      message: req.__("Data fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
