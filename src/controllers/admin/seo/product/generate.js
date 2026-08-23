import SEOResource from "../../../../resources/SEOResource.js";
import { seoService } from "../../../../services/index.js";

export const generate = async (req, res, next) => {
  try {
    const { product_id } = req.params;
    const { overwrite = false } = req.body;

    const { seo, score } = await seoService.generateProductSEO(product_id, {
      actorId: req.auth.user_id,
      overwrite,
    });

    res.status(200).json({
      status: "success",
      message: req.__(overwrite ? "SEO regenerated successfully" : "SEO generated successfully"),
      data: { seo: new SEOResource(seo).exec(), score },
    });
  } catch (error) {
    next(error);
  }
};
