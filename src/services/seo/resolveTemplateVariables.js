// Pulls only data that actually exists on the (populated) product doc —
// never invents a value for a missing brand/category/attribute.
export const resolveTemplateVariables = (product, settings) => {
  const category = Array.isArray(product?.categories) && product.categories.length
    ? product.categories[0]
    : null;
  const subCategory = Array.isArray(product?.sub_categories) && product.sub_categories.length
    ? product.sub_categories[0]
    : null;

  return {
    productName: product?.name || "",
    categoryName: category?.name || "",
    subcategoryName: subCategory?.name || "",
    brandName: product?.brand?.name || "",
    // Attribute data lives in a separate collection for variable products and
    // isn't fetched here — resolves to "" (cleanly dropped by the generator)
    // unless a caller passes a precomputed label via product.primary_attribute_label.
    attribute: product?.primary_attribute_label || "",
    price: product?.regular_price != null ? String(product.regular_price) : "",
    siteName: settings?.site_name || "Elexify",
  };
};
