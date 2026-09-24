import Product from "../../../../models/Product.js";
import Category from "../../../../models/Category.js";
import { suggestCatalog } from "../../../../services/inventory/resolveCatalogSlug.js";

// "Did you mean" links for a product or category URL that did not resolve.
export const suggestions = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const [products, categories] = await Promise.all([
      suggestCatalog(Product, slug, 6),
      suggestCatalog(Category, slug, 3),
    ]);
    res.set("Cache-Control", "public, max-age=300");
    res.json({ status: "success", data: { products, categories } });
  } catch (error) { next(error); }
};
