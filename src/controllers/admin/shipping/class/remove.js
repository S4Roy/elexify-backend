import ShippingClass from "../../../../models/ShippingClass.js";
import Product from "../../../../models/Product.js";
import { StatusError } from "../../../../config/index.js";
import ShippingClassResource from "../../../../resources/ShippingClassResource.js";

export const remove = async (req, res, next) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      throw StatusError.badRequest(req.__("Shipping Class ID is required"));
    }

    const shippingClass = await ShippingClass.findOne({ _id, deleted_at: null });
    if (!shippingClass) {
      throw StatusError.notFound(req.__("Shipping Class not found"));
    }

    const inUse = await Product.exists({ shipping_class: _id, deleted_at: null });
    if (inUse) {
      throw StatusError.conflict(
        req.__("This shipping class is assigned to one or more products and cannot be deleted")
      );
    }

    shippingClass.deleted_at = new Date();
    shippingClass.deleted_by = req.auth.user_id;
    await shippingClass.save();

    res.status(200).json({
      status: "success",
      message: req.__("Shipping Class deleted successfully"),
      data: new ShippingClassResource(shippingClass).exec(),
    });
  } catch (error) {
    next(error);
  }
};
