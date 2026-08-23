import ShippingZone from "../../../../models/ShippingZone.js";
import { envs } from "../../../../config/index.js";
import ShippingZoneResource from "../../../../resources/ShippingZoneResource.js";

export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "created_at",
      sort_order = -1,
      status = null,
    } = req.query;

    const options = { page, limit, sort: { [sort_by]: sort_order } };

    let matchFilter = { deleted_at: null };
    if (status) matchFilter.status = status;
    if (search_key) {
      matchFilter.name = { $regex: ".*" + search_key + ".*", $options: "i" };
    }

    const pipeline = [{ $match: matchFilter }];

    const data = await ShippingZone.aggregatePaginate(
      ShippingZone.aggregate(pipeline),
      options
    );

    data.docs = await ShippingZoneResource.collection(data.docs);

    res.status(200).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
