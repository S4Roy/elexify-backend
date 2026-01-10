import Attribute from "../../../../models/Attribute.js";
import AttributeValue from "../../../../models/AttributeValue.js";
import Media from "../../../../models/Media.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import AttributeResource from "../../../../resources/AttributeResource.js";
import { generalHelper } from "../../../../helpers/index.js";
import { inventoryService } from "../../../../services/index.js";

/**
 * Edit Attribute
 * @param req
 * @param res
 * @param next
 */
export const edit = async (req, res, next) => {
  try {
    const {
      _id,
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

    if (!_id) {
      throw StatusError.badRequest(req.__("Attribute ID is required"));
    }

    // Find the existing attribute
    const attribute = await Attribute.findById(_id).exec();
    if (!attribute) {
      throw StatusError.notFound(req.__("Attribute not found"));
    }

    // Generate new slug if name changed
    let slug = attribute.slug;
    if (name && name !== attribute.name) {
      slug = generalHelper.generateSlugName(name);
      let existing = await Attribute.findOne({ slug, _id: { $ne: _id } });
      let count = 1;
      while (existing) {
        slug = generalHelper.generateSlugName(`${name}-${count++}`);
        existing = await Attribute.findOne({ slug, _id: { $ne: _id } });
      }
    }

    const updateData = {
      ...(name && { name }),
      ...(slug && { slug }),
      ...(display_type && { display_type }),
      ...(values_sort_by && { values_sort_by }),
      ...(status !== undefined && { status }),
      ...(description !== undefined && { description }),
      visible_in_list: visible_in_list,
      customized_mala_mukhi: customized_mala_mukhi,
      customized_mala_design: customized_mala_design,
      customized_mala_type: customized_mala_type,
      size_meta: size_meta,
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    };

    // Update attribute
    const updatedAttribute = await Attribute.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // Handle attribute values
    const existingValues = await AttributeValue.find({ attribute_id: _id });
    const existingMap = new Map(
      existingValues.map((v) => [v._id.toString(), v])
    );
    const incomingMap = new Map();
    const newValues = [];

    for (let i = 0; i < values.length; i++) {
      const item = values[i];
      const valueName = item.name ?? item.value;
      if (!valueName) continue;
      const indexOrder = i;

      if (item._id && existingMap.has(item._id)) {
        const doc = existingMap.get(item._id);

        if (valueName !== doc.name) {
          const baseSlug = generalHelper.generateSlugName(valueName);
          let newSlug = baseSlug;
          let exists = await AttributeValue.findOne({
            slug: newSlug,
            _id: { $ne: doc._id },
          });
          let count = 1;
          while (exists) {
            newSlug = `${baseSlug}-${count++}`;
            exists = await AttributeValue.findOne({
              slug: newSlug,
              _id: { $ne: doc._id },
            });
          }
          doc.slug = newSlug;
        }

        doc.name = valueName;
        doc.description = item.description || null;
        doc.hex = item.hex || null;
        doc.hex = item.hex || null;
        doc.visible_in_list = item.visible_in_list;
        doc.sort_order = indexOrder;
        doc.image = item.image || null;
        doc.meta = item.meta || null;
        doc.status = item.status || "active";
        // ⭐ NEW PRICE FIELDS ⭐
        doc.price_modifier = item.price_modifier ?? 0;
        doc.price_type = item.price_type ?? "fixed";
        doc.sku = item.sku ?? null;
        doc.min_qty = item.min_qty ?? null;
        doc.max_qty = item.max_qty ?? null;
        doc.updated_by = req.auth.user_id;
        doc.updated_at = new Date();
        await doc.save();
        incomingMap.set(item._id, true);
      } else {
        // Insert new
        const baseSlug = generalHelper.generateSlugName(valueName);
        let slug = baseSlug;
        let exists = await AttributeValue.findOne({ slug });
        let count = 1;
        while (exists) {
          slug = `${baseSlug}-${count++}`;
          exists = await AttributeValue.findOne({ slug });
        }

        newValues.push({
          attribute_id: _id,
          name: valueName, // human label
          slug,
          hex: item.hex || null, // useful for color swatches
          visible_in_list: item.visible_in_list,
          image: item.image || null,
          sort_order: indexOrder,
          meta: item.meta || null,
          description: item.description || null,
          status: item.status || "active",
          // ⭐ NEW PRICE FIELDS
          price_modifier: item.price_modifier ?? 0,
          price_type: item.price_type ?? "fixed",
          sku: item.sku ?? null,
          min_qty: item.min_qty ?? null,
          max_qty: item.max_qty ?? null,
          created_by: req.auth.user_id,
        });
      }
    }

    // Insert new values
    if (newValues.length > 0) {
      await AttributeValue.insertMany(newValues);
    }

    // Delete removed values
    for (const [id, doc] of existingMap) {
      if (!incomingMap.has(id)) {
        if (!doc.deleted_at) {
          await AttributeValue.findByIdAndUpdate(id, {
            $set: {
              deleted_at: new Date(),
              deleted_by: req.auth.user_id,
              updated_by: req.auth.user_id,
              updated_at: new Date(),
            },
          });
        }
      }
    }
    // await inventoryService.productService.syncVariationVisibilityByAttribute(
    //   updatedAttribute?._id
    // );
    // Final response
    res.status(200).json({
      status: "success",
      message: req.__("Attribute updated successfully"),
      data: new AttributeResource(updatedAttribute).exec(),
    });
  } catch (error) {
    next(error);
  }
};
