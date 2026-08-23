import ShippingClass from "../../../../models/ShippingClass.js";
import { StatusError } from "../../../../config/index.js";
import ShippingClassResource from "../../../../resources/ShippingClassResource.js";

export const edit = async (req, res, next) => {
  try {
    const { _id, name, description, is_default, status } = req.body;

    const shippingClass = await ShippingClass.findOne({ _id, deleted_at: null });
    if (!shippingClass) {
      throw StatusError.notFound(req.__("Shipping Class not found"));
    }

    if (is_default) {
      await ShippingClass.updateMany(
        { _id: { $ne: _id }, is_default: true },
        { $set: { is_default: false } }
      );
    }

    Object.assign(shippingClass, {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(is_default !== undefined && { is_default }),
      ...(status !== undefined && { status }),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    });

    await shippingClass.save();

    res.status(200).json({
      status: "success",
      message: req.__("Shipping Class updated successfully"),
      data: new ShippingClassResource(shippingClass).exec(),
    });
  } catch (error) {
    next(error);
  }
};
