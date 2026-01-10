import Specification from "../../../../models/Specification.js";
import Media from "../../../../models/Media.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import SpecificationResource from "../../../../resources/SpecificationResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Edit Specification
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, label, type, options, status, visible, required } = req.body;

    // Find the existing specification
    const specification = await Specification.findById(_id).exec();
    if (!specification) {
      throw StatusError.notFound(req.__("Specification not found"));
    }

    let key = generalHelper.generateKeyName(label);
    let existiingItem = await Specification.findOne({ key }).exec();
    let count = 1;

    while (existiingItem) {
      key = generalHelper.generateKeyName(`${label}_${count}`);
      existiingItem = await Specification.findOne({ key }).exec();
      count++;
    }

    const updateData = {
      ...(label && { label }),
      ...(key && { key }),
      ...(type && { type }),
      ...(visible !== undefined && { visible }),
      ...(required !== undefined && { required }),
      ...(options && { options }),
      ...(status !== undefined && { status }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    };

    // Update the specification
    const updatedData = await Specification.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Success Response
    res.status(200).json({
      status: "success",
      message: req.__("Specification updated successfully"),
      data: new SpecificationResource(updatedData).exec(),
    });
  } catch (error) {
    next(error);
  }
};
