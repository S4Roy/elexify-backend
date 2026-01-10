import ExchangeRate from "../../../../models/ExchangeRate.js";
import { StatusError } from "../../../../config/index.js";
import { envs } from "../../../../config/index.js";
import mongoose from "mongoose";

export const exchangeRate = async (req, res, next) => {
  try {
    const rates = await ExchangeRate.findOne().sort({ updated_at: -1 });
    res.status(200).json({
      status: "success",
      message: "Details fetched successfully",
      data: rates,
    });
  } catch (error) {
    next(error);
  }
};
