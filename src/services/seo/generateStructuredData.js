import { envs } from "../../config/index.js";
import { deriveStockStatus } from "../stock/availability.js";

const schemaAvailability = (product) => {
  if (product.status !== "active") return "https://schema.org/OutOfStock";
  const status = product.type === "variable" && product.stock_status ? product.stock_status : deriveStockStatus(product);
  if (status === "in_stock") return "https://schema.org/InStock";
  if (status === "on_backorder") return "https://schema.org/BackOrder";
  return "https://schema.org/OutOfStock";
};

// Builds a schema.org/Product JSON-LD object using only fields that actually
// exist on the product doc — never fabricates certifications, benefits,
// specs, guarantees, discounts, or availability.
export const generateStructuredData = (product, seo, { baseUrl } = {}) => {
  if (!product || seo?.schema_enabled === false) return null;

  const images = Array.isArray(product.images)
    ? product.images
        .map((img) => (img?.url ? `${envs.s3.BASE_URL}${img.url}` : null))
        .filter(Boolean)
    : [];

  const data = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
  };

  if (product.description) {
    data.description = String(product.description).replace(/<[^>]*>/g, "").trim();
  }
  if (images.length) data.image = images;
  if (product.sku) data.sku = product.sku;
  if (product.brand?.name) data.brand = { "@type": "Brand", name: product.brand.name };

  const categoryName = Array.isArray(product.categories) ? product.categories[0]?.name : null;
  if (categoryName) data.category = categoryName;

  const price = product.sale_price ?? product.regular_price;
  if (price != null) {
    data.offers = {
      "@type": "Offer",
      priceCurrency: "INR",
      price: String(price),
      availability: schemaAvailability(product),
      ...(baseUrl && product.slug ? { url: `${baseUrl.replace(/\/$/, "")}/product/${product.slug}/` } : {}),
    };
  }

  if ((product.total_reviews ?? 0) > 0 && (product.avg_rating ?? 0) > 0) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(product.avg_rating),
      ratingCount: String(product.total_reviews),
    };
  }

  return data;
};
