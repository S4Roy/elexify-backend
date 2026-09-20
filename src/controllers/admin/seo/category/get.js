import Category from "../../../../models/Category.js";
import SEO from "../../../../models/SEO.js";
import { StatusError } from "../../../../config/index.js";
import SEOResource from "../../../../resources/SEOResource.js";

// Mirrors controllers/admin/seo/product/get.js, minus the score/duplicate
// checks — those are hardcoded to reference_type:"products" in
// services/seo/detectDuplicates.js and there's no admin UI consuming a
// category SEO score yet, so it's not worth generalizing that service here.
export const get = async (req, res, next) => {
  try {
    const { category_id } = req.params;

    const category = await Category.findOne({ _id: category_id, deleted_at: null }).lean();
    if (!category) throw StatusError.notFound("Category not found");

    let seo = category.seo ? await SEO.findById(category.seo) : null;
    if (!seo) {
      seo = await SEO.create({
        reference_id: category._id,
        reference_type: "categories",
        meta_title: category.name,
        canonical_url: `/category/${category.slug}/`,
      });
      await Category.findByIdAndUpdate(category._id, { seo: seo._id });
    }

    res.status(200).json({
      status: "success",
      message: req.__("SEO data fetched successfully"),
      data: { seo: new SEOResource(seo).exec() },
    });
  } catch (error) {
    next(error);
  }
};
