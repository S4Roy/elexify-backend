import Product from "../../../../models/Product.js";
import SEO from "../../../../models/SEO.js";
import { StatusError } from "../../../../config/index.js";
import SEOResource from "../../../../resources/SEOResource.js";
import { seoService } from "../../../../services/index.js";

export const get = async (req, res, next) => {
  try {
    const { product_id } = req.params;

    const product = await Product.findOne({ _id: product_id, deleted_at: null })
      .populate("brand", "name")
      .populate("categories", "name")
      .populate("images", "url alt_text")
      .lean();
    if (!product) throw StatusError.notFound("Product not found");

    let seo = product.seo ? await SEO.findById(product.seo) : null;
    if (!seo) {
      seo = await SEO.create({
        reference_id: product._id,
        reference_type: "products",
        meta_title: product.name,
        canonical_url: `/product/${product.slug}`,
      });
      await Product.findByIdAndUpdate(product._id, { seo: seo._id });
    }

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
      message: req.__("SEO data fetched successfully"),
      data: { seo: new SEOResource(seo).exec(), score },
    });
  } catch (error) {
    next(error);
  }
};
