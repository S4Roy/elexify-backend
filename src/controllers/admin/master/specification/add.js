import Specification from "../../../../models/Specification.js";
import { StatusError } from "../../../../config/index.js";
import SpecificationResource from "../../../../resources/SpecificationResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Add Specification
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const { label, type, options = [], status, visible, required } = req.body;
    // Generate a unique key
    let key = generalHelper.generateKeyName(label);
    let existiingItem = await Specification.findOne({ key }).exec();
    let count = 1;

    while (existiingItem) {
      key = generalHelper.generateKeyName(`${label}_${count}`);
      existiingItem = await Specification.findOne({ key }).exec();
      count++;
    }

    // Create new specification
    const specification = new Specification({
      label,
      key,
      type,
      visible,
      required,
      options: options || [],
      status: status || "active",
      created_by: req.auth.user_id,
      updated_by: req.auth.user_id,
    });

    // Save specification
    await specification.save();

    // Success Response
    res.status(201).json({
      status: "success",
      message: req.__("Specification added successfully"),
      data: new SpecificationResource(specification).exec(),
    });
  } catch (error) {
    next(error);
  }
};
