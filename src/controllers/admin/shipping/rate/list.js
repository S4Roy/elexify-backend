import ShippingRate from "../../../../models/ShippingRate.js";
import { envs } from "../../../../config/index.js";
import ShippingRateResource from "../../../../resources/ShippingRateResource.js";

export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      sort_by = "created_at",
      sort_order = -1,
      status = null,
      zone = null,
    } = req.query;

    const options = { page, limit, sort: { [sort_by]: sort_order } };

    let matchFilter = { deleted_at: null };
    if (status) matchFilter.status = status;
    if (zone) matchFilter.zone = zone;

    const pipeline = [
      { $match: matchFilter },
      {
        $lookup: {
          from: "shipping_zones",
          localField: "zone",
          foreignField: "_id",
          as: "zone",
        },
      },
      { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "shipping_classes",
          localField: "shipping_class",
          foreignField: "_id",
          as: "shipping_class",
        },
      },
      { $unwind: { path: "$shipping_class", preserveNullAndEmptyArrays: true } },
    ];

    const data = await ShippingRate.aggregatePaginate(
      ShippingRate.aggregate(pipeline),
      options
    );

    data.docs = await ShippingRateResource.collection(data.docs);

    res.status(200).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
