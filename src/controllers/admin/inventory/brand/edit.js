import Brand from "../../../../models/Brand.js";
import Media from "../../../../models/Media.js";
import { StatusError } from "../../../../config/index.js";
import { s3Handler } from "../../../../services/s3Handler/s3Handler.js";
import path from "path";
import BrandResource from "../../../../resources/BrandResource.js"; // ← use the correct resource
import { generalHelper } from "../../../../helpers/index.js";

/**
 * Edit Brand
 */
export const edit = async (req, res, next) => {
  try {
    const { _id, name, description, parent_brand, status } = req.body;
    const image = req?.files?.image ?? null;

    if (!_id) throw StatusError.badRequest(req.__("Brand ID is required"));

    const brand = await Brand.findById(_id).exec();
    if (!brand) throw StatusError.notFound(req.__("Brand not found"));

    // 1) prevent self-parent
    if (parent_brand && String(parent_brand) === String(_id)) {
      throw StatusError.badRequest(req.__("A brand cannot be its own parent"));
    }

    // 2) slug (only if name changed)
    let slug = brand.slug;
    let previous_slugs = brand.previous_slugs || [];
    if (name && name !== brand.name) {
      // keep old slug if it existed
      if (brand.slug)
        previous_slugs = Array.from(new Set([brand.slug, ...previous_slugs]));

      slug = generalHelper.generateSlugName(name);
      let exists = await Brand.findOne({ slug, _id: { $ne: _id } }).lean();
      let count = 1;
      while (exists) {
        slug = generalHelper.generateSlugName(`${name}-${count++}`);
        exists = await Brand.findOne({ slug, _id: { $ne: _id } }).lean();
      }
    }

    // 3) sanitize parent_brand
    let sanitizedParentBrand = null;
    if (
      parent_brand !== undefined &&
      parent_brand !== null &&
      parent_brand !== "" &&
      parent_brand !== "null" &&
      generalHelper.sanitizeObjectId(parent_brand)
    ) {
      sanitizedParentBrand = generalHelper.sanitizeObjectId(parent_brand);
      // optional: ensure parent exists
      const parentExists = await Brand.exists({ _id: sanitizedParentBrand });
      if (!parentExists)
        throw StatusError.badRequest(req.__("Parent brand not found"));
      // optional: prevent simple cycle (parent’s parent being this brand). For deep cycle checks, do a loop up the tree.
      if (String(sanitizedParentBrand) === String(_id)) {
        throw StatusError.badRequest(req.__("Invalid parent assignment"));
      }
    }

    // 4) build update payload
    const updateData = {
      ...(name && { name }),
      ...(slug && { slug }),
      ...(description !== undefined && { description: description || null }),
      ...(status !== undefined && { status }),
      ...(sanitizedParentBrand !== null && {
        parent_brand: sanitizedParentBrand,
      }),
      ...(previous_slugs?.length ? { previous_slugs } : {}),
      updated_by: req.auth.user_id,
      updated_at: new Date(),
    };

    // 5) handle image upload (and link Media to brand)
    let newMediaId = null;
    if (image) {
      const key = `brands/${slug}${path.extname(image.name)}`;
      const s3Upload = await s3Handler.uploadToS3(image, key);
      if (!s3Upload)
        throw StatusError.badRequest(req.__("Brand image upload failed"));

      const media = await new Media({
        reference_id: _id, // link immediately
        reference_type: "brands",
        alt_text: image.name,
        url: key,
        type: "image",
        status: "active",
        created_by: req.auth.user_id,
      }).save();

      newMediaId = media._id;
      updateData.image = newMediaId;

      // Optional: if replacing, deactivate previous image
      if (brand.image && String(brand.image) !== String(newMediaId)) {
        await Media.findByIdAndUpdate(brand.image, {
          $set: {
            status: "inactive",
            updated_by: req.auth.user_id,
            updated_at: new Date(),
          },
        });
      }
    }

    // 6) persist brand
    const updated = await Brand.findByIdAndUpdate(
      _id,
      { $set: updateData },
      { new: true }
    );

    // 7) ensure media reference is set (in case you kept reference_id: null for some reason)
    if (newMediaId) {
      await Media.findByIdAndUpdate(newMediaId, {
        $set: { reference_id: updated._id },
      });
    }

    return res.status(200).json({
      status: "success",
      message: req.__("Brand updated successfully"),
      data: new BrandResource(updated).exec(),
    });
  } catch (error) {
    next(error);
  }
};
