import NavigationMenu from "../../../models/NavigationMenu.js";
import { envs } from "../../../config/index.js";

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

    const options = {
      page,
      limit,
      sort: { [sort_by]: sort_order },
    };

    const matchFilter = { deleted_at: null };
    if (status) {
      matchFilter.status = { $in: status.split(",") };
    }

    const pipeline = [{ $match: matchFilter }];

    if (search_key) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search_key, $options: "i" } },
            { slug: { $regex: search_key, $options: "i" } },
          ],
        },
      });
    }

    const data = await NavigationMenu.aggregatePaginate(
      NavigationMenu.aggregate(pipeline),
      options
    );

    res.status(200).json({
      status: "success",
      message: req.__("List fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};
