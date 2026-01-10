import Specification from "../../../../models/Specification.js";
import { envs } from "../../../../config/index.js";

/**
 * Add Specification
 * @param req
 * @param res
 * @param next
 */
export const order = async (req, res, next) => {
  try {
    const { items = [] } = req.body;
    const bulkOps = items.map((item, index) => ({
      updateOne: {
        filter: { _id: item._id },
        update: { $set: { sort_order: index + 1 } },
      },
    }));

    if (bulkOps.length > 0) {
      await Specification.bulkWrite(bulkOps);
    }
    res.status(201).json({
      status: "success",
      message: req.__(`Order updated successfully`),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
