import Attribute from "../../../../models/Attribute.js";
import AttributeValue from "../../../../models/AttributeValue.js";
import { StatusError } from "../../../../config/index.js";
import AttributeResource from "../../../../resources/AttributeResource.js";
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Add Attribute with optional values
 * @param req
 * @param res
 * @param next
 */
export const add = async (req, res, next) => {
  try {
    const {
      name,
      description,
      status,
      display_type = "dropdown", // dropdown|radio|image
      values = [],
      values_sort_by = "sort_order",
      visible_in_list = true,
      size_meta = false,
      customized_mala_mukhi = false,
      customized_mala_design = false,
      customized_mala_type = false,
    } = req.body;

    // Generate a unique slug
    let slug = generalHelper.generateSlugName(name);
    let existingData = await Attribute.findOne({ slug }).exec();
    let count = 1;

    while (existingData) {
      slug = generalHelper.generateSlugName(`${name}-${count}`);
      existingData = await Attribute.findOne({ slug }).exec();
      count++;
    }

    // Create attribute
    const attribute = new Attribute({
      name,
      slug,
      visible_in_list,
      customized_mala_mukhi,
      customized_mala_design,
      customized_mala_type,
      size_meta,
      description: description || null,
      display_type, // NEW: hint for frontend
      values_sort_by, // optional - how to sort values on frontend
      status: status || "active",
      created_by: req.auth.user_id,
    });
    await attribute.save();

    // Create values if provided
    if (Array.isArray(values) && values.length > 0) {
      const valuesToInsert = [];

      for (let i = 0; i < values.length; i++) {
        const item = values[i];
        const valueName = item.name ?? item.value;
        if (!valueName) continue;

        const valueSlugBase = generalHelper.generateSlugName(valueName);
        let valueSlug = valueSlugBase;
        let existing = await AttributeValue.findOne({ slug: valueSlug }).exec();
        let suffix = 1;

        while (existing) {
          valueSlug = `${valueSlugBase}-${suffix++}`;
          existing = await AttributeValue.findOne({ slug: valueSlug }).exec();
        }

        valuesToInsert.push({
          attribute_id: attribute._id,
          name: valueName, // human label
          slug: valueSlug,
          description: item.description || null,
          hex: item.hex || null, // useful for color swatches
          image: item.image || null,
          visible_in_list: item.visible_in_list,
          sort_order: i,
          meta: item.meta || null,
          status: item.status || "active",
          created_by: req.auth.user_id,
          // ⭐ NEW PRICE FIELDS ⭐
          price_modifier: item.price_modifier ?? 0, // number
          price_type: item.price_type ?? "fixed", // fixed | percent

          // OPTIONAL SKU & QTY RULES
          sku: item.sku || null,
          min_qty: item.min_qty || null,
          max_qty: item.max_qty || null,
        });
      }

      if (valuesToInsert.length) {
        await AttributeValue.insertMany(valuesToInsert);
      }
    }

    // Response
    res.status(201).json({
      status: "success",
      message: req.__("Attribute and values added successfully"),
      data: new AttributeResource(attribute).exec(),
    });
  } catch (error) {
    next(error);
  }
};
