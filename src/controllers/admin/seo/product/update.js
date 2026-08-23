import Product from "../../../../models/Product.js";
import SEO from "../../../../models/SEO.js";
import { StatusError } from "../../../../config/index.js";
import SEOResource from "../../../../resources/SEOResource.js";
import { seoService } from "../../../../services/index.js";

// Manual edits here mark the corresponding field as no longer eligible for
// silent (non-overwrite) regeneration — "Regenerate & Replace" is the only
// way to clobber a hand-edited title/description/keyword afterwards.
export const update = async (req, res, next) => {
  try {
    const { product_id } = req.params;
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

    const product = await Product.findOne({ _id: product_id, deleted_at: null })
      .populate("brand", "name")
      .populate("categories", "name")
      .populate("images", "url alt_text")
      .lean();
    if (!product) throw StatusError.notFound("Product not found");
    if (!product.seo) throw StatusError.notFound("SEO record not found for this product");

    const seo = await SEO.findById(product.seo);
    if (!seo) throw StatusError.notFound("SEO record not found for this product");

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

    const [dupTitle, dupDescription] = await Promise.all([
      seoService.isTitleDuplicate(seo._id, seo.meta_title),
      seoService.isDescriptionDuplicate(seo._id, seo.meta_description),
    ]);
    const score = seoService.calculateSeoScore(product, seo, {
      isDuplicateTitle: dupTitle,
      isDuplicateDescription: dupDescription,
      imageAlt: product.images?.[0]?.alt_text || null,
    });

    res.status(200).json({
      status: "success",
      message: req.__("SEO data updated successfully"),
      data: { seo: new SEOResource(seo).exec(), score },
    });
  } catch (error) {
    next(error);
  }
};
