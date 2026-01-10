import Address from "../../../models/Address.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";
import AddressResource from "../../../resources/AddressResource.js";
import mongoose from "mongoose";

/**
 * Add Address
 * @param req
 * @param res
 * @param next
 */
export const defaultAddress = async (req, res, next) => {
  try {
    const user_id = req.auth?.user_id || null;

    let matchFilter = {
      deleted_at: null,
      user: new mongoose.Types.ObjectId(user_id),
      is_default: true,
    };

    const pipeline = [{ $match: matchFilter }];
    let data = await Address.aggregate(pipeline);

    res.status(201).json({
      status: "success",
      message: req.__(`Details fetched successfully`),
      data: data[0],
    });
  } catch (error) {
    next(error);
  }
};
