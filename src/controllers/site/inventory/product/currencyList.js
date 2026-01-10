import Currency from "../../../../models/Currency.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";

export const currencyList = async (req, res, next) => {
  try {
    // Find the most recently updated active currency document
    const CurrencyList = await Currency.find({ status: "active" }).sort({
      _id: -1,
    });

    if (!CurrencyList) {
      throw StatusError.notFound("No active currency found");
    }

    res.status(200).json({
      status: "success",
      message: "Details fetched successfully",
      data: CurrencyList,
    });
  } catch (error) {
    next(error);
  }
};
