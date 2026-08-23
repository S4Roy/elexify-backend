import { seoService } from "../../../../services/index.js";

export const bulkGenerate = async (req, res, next) => {
  try {
    const { product_ids, filter, overwrite = false } = req.body;

    const result = await seoService.generateBulkProductSEO({
      productIds: product_ids,
      filter,
      overwrite,
      actorId: req.auth.user_id,
    });

    res.status(200).json({
      status: "success",
      message: req.__("Bulk SEO generation completed"),
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
