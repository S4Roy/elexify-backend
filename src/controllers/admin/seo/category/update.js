import Category from "../../../../models/Category.js";
import SEO from "../../../../models/SEO.js";
import { StatusError } from "../../../../config/index.js";
import SEOResource from "../../../../resources/SEOResource.js";

// Mirrors controllers/admin/seo/product/update.js (see get.js for why the
// score/duplicate-detection step is omitted here).
export const update = async (req, res, next) => {
  try {
    const { category_id } = req.params;
    const {
      meta_title,
      meta_description,
      meta_keywords,
      focus_keyword,
      canonical_url,
      robots,
      og_title,
      og_description,
      og_image,
      twitter_title,
      twitter_description,
      twitter_image,
      schema_enabled,
    } = req.body;

    const category = await Category.findOne({ _id: category_id, deleted_at: null }).lean();
    if (!category) throw StatusError.notFound("Category not found");
    if (!category.seo) throw StatusError.notFound("SEO record not found for this category");

    const seo = await SEO.findById(category.seo);
    if (!seo) throw StatusError.notFound("SEO record not found for this category");

    if (meta_title !== undefined && meta_title !== seo.meta_title) {
      seo.title_manually_edited = true;
    }
    if (meta_description !== undefined && meta_description !== seo.meta_description) {
      seo.description_manually_edited = true;
    }
    if (focus_keyword !== undefined && focus_keyword !== seo.focus_keyword) {
      seo.focus_keyword_manually_edited = true;
    }

    Object.assign(seo, {
      ...(meta_title !== undefined && { meta_title }),
      ...(meta_description !== undefined && { meta_description }),
      ...(meta_keywords !== undefined && {
        meta_keywords: meta_keywords
          ? meta_keywords.split(",").map((k) => k.trim()).filter(Boolean)
          : [],
      }),
      ...(focus_keyword !== undefined && { focus_keyword }),
      ...(canonical_url !== undefined && { canonical_url }),
      ...(robots !== undefined && { robots }),
      ...(og_title !== undefined && { og_title }),
      ...(og_description !== undefined && { og_description }),
      ...(og_image !== undefined && { og_image }),
      ...(twitter_title !== undefined && { twitter_title }),
      ...(twitter_description !== undefined && { twitter_description }),
      ...(twitter_image !== undefined && { twitter_image }),
      ...(schema_enabled !== undefined && { schema_enabled }),
      updated_at: new Date(),
    });

    await seo.save();

    res.status(200).json({
      status: "success",
      message: req.__("SEO data updated successfully"),
      data: { seo: new SEOResource(seo).exec() },
    });
  } catch (error) {
    next(error);
  }
};
