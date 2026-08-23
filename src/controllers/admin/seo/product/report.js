import SEOResource from "../../../../resources/SEOResource.js";
import { seoService } from "../../../../services/index.js";

export const report = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = "", filter = "" } = req.query;

    const rows = await seoService.getProductSeoRows({ search });
    const filtered = seoService.applySeoReportFilter(rows, filter);

    const total = filtered.length;
    const start = (Number(page) - 1) * Number(limit);
    const pageRows = filtered.slice(start, start + Number(limit));

    const docs = pageRows.map(({ product, seo, score }) => ({
      product: { _id: product._id, name: product.name, slug: product.slug },
      seo: seo ? new SEOResource(seo).exec() : null,
      score,
    }));

    res.status(200).json({
      status: "success",
      message: req.__("SEO report fetched successfully"),
      data: {
        docs,
        totalDocs: total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};
