import City from "../../../models/City.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";

export const cityList = async (req, res, next) => {
  try {
    const { state_id } = req.params;

    let filter = { status: "active" };
    if (state_id) {
      filter.state_id = state_id;
    } else {
      throw StatusError.badRequest("State ID is required");
    }
    // Find the most recently updated active city document
    const cityList = await City.find(filter).sort({
      name: 1,
    });

    if (!cityList) {
      throw StatusError.notFound("No active city found");
    }

    res.status(200).json({
      status: "success",
      message: "Details fetched successfully",
      data: cityList,
    });
  } catch (error) {
    next(error);
  }
};
