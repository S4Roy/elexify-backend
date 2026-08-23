import ShippingClass from "../../../../models/ShippingClass.js";
import { StatusError } from "../../../../config/index.js";
import ShippingClassResource from "../../../../resources/ShippingClassResource.js";
import { generalHelper } from "../../../../helpers/index.js";

export const add = async (req, res, next) => {
  try {
    const { name, description, is_default, status } = req.body;

    let slug = generalHelper.generateSlugName(name);
    let count = 1;
    while (await ShippingClass.exists({ slug, deleted_at: null })) {
      slug = generalHelper.generateSlugName(`${name}-${count}`);
      count++;
    }

    if (is_default) {
      await ShippingClass.updateMany({ is_default: true }, { $set: { is_default: false } });
    }

    const shippingClass = await ShippingClass.create({
      name,
      slug,
      description: description || null,
      is_default: !!is_default,
      status: status || "active",
      created_by: req.auth.user_id,
    });

    res.status(201).json({
      status: "success",
      message: req.__("Shipping Class added successfully"),
      data: new ShippingClassResource(shippingClass).exec(),
    });
  } catch (error) {
    next(error);
  }
};
