import Country from "../../../models/Country.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";

export const countryList = async (req, res, next) => {
  try {
    // Find the most recently updated active country document
    const CountryList = await Country.find({ status: "active" }).sort({
      name: 1,
    });

    if (!CountryList) {
      throw StatusError.notFound("No active country found");
    }

    res.status(200).json({
      status: "success",
      message: "Details fetched successfully",
      data: CountryList,
    });
  } catch (error) {
    next(error);
  }
};
