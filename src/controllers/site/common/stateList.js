import State from "../../../models/State.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";

export const stateList = async (req, res, next) => {
  try {
    const { country_id } = req.params;

    let filter = { status: "active" };
    if (country_id) {
      filter.country_id = country_id;
    } else {
      throw StatusError.badRequest("Country ID is required");
    }
    // Find the most recently updated active country document
    const stateList = await State.find(filter).sort({
      name: 1,
    });

    if (!stateList) {
      throw StatusError.notFound("No active state found");
    }

    res.status(200).json({
      status: "success",
      message: "Details fetched successfully",
      data: stateList,
    });
  } catch (error) {
    next(error);
  }
};
