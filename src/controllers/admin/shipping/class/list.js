import ShippingClass from "../../../../models/ShippingClass.js";
import { envs } from "../../../../config/index.js";
import ShippingClassResource from "../../../../resources/ShippingClassResource.js";

export const list = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = envs.pagination.limit,
      search_key = "",
      sort_by = "sort_order",
      sort_order = 1,
      status = null,
    } = req.query;

    const options = {
      page,
      limit,
      sort: { [sort_by]: sort_order },
    };

    let matchFilter = { deleted_at: null };
    if (status) matchFilter.status = status;
    if (search_key) {
      matchFilter.$or = [
        { name: { $regex: ".*" + search_key + ".*", $options: "i" } },
        { slug: { $regex: ".*" + search_key + ".*", $options: "i" } },
      ];
    }

    const pipeline = [{ $match: matchFilter }];

    const data = await ShippingClass.aggregatePaginate(
      ShippingClass.aggregate(pipeline),
      options
    );

    data.docs = await ShippingClassResource.collection(data.docs);

    res.status(200).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
