import Resource from "resources.js";
import UserResource from "./UserResource.js";
import ProductResourceMinimal from "./ProductResourceMinimal.js";
import CategoryResourceMinimal from "./CategoryResourceMinimal.js";
import BrandResource from "./BrandResource.js";

class CouponResource extends Resource {
  toArray() {
    return {
      _id: this._id || null,

      /* =====================
         BASIC INFO
      ====================== */
      code: this.code || null,
      title: this.title || null,
      description: this.description || null,

      /* =====================
         DISCOUNT CONFIG
      ====================== */
      discount_type: this.discount_type || "fixed",
      discount_value: this.discount_value ?? 0,
      max_discount_amount: this.max_discount_amount ?? null,
      min_cart_value: this.min_cart_value ?? 0,

      /* =====================
         APPLICABILITY
      ====================== */
      applicable_for: this.applicable_for || "user",

      applicable_scope: this.applicable_scope || "all",

      applicable_products: this.applicable_products
        ? ProductResourceMinimal.collection(this.applicable_products)
        : [],

      applicable_categories: this.applicable_categories
        ? CategoryResourceMinimal.collection(this.applicable_categories)
        : [],

      applicable_brands: this.applicable_brands
        ? BrandResource.collection(this.applicable_brands)
        : [],

      applicable_variations: Array.isArray(this.applicable_variations)
        ? this.applicable_variations
        : [], // usually IDs only (no heavy resource)

      /* =====================
         USAGE RULES
      ====================== */
      usage_limit: this.usage_limit ?? null,
      usage_per_email: this.usage_per_email ?? 1,
      total_used: this.total_used ?? 0,
      single_use_per_order: this.single_use_per_order ?? true,

      /* =====================
         DATE VALIDITY
      ====================== */
      start_date: this.start_date || null,
      end_date: this.end_date || null,

      /* =====================
         EXCLUSIONS
      ====================== */
      exclude_sale_items: this.exclude_sale_items ?? false,
      exclude_ask_for_price: this.exclude_ask_for_price ?? true,
      exclude_enquiry_products: this.exclude_enquiry_products ?? true,

      /* =====================
         STATUS & AUDIT
      ====================== */
      status: this.status || "active",

      created_at: this.created_at || null,
      updated_at: this.updated_at || null,

      created_by: this.created_by
        ? new UserResource(this.created_by).exec()
        : null,

      updated_by: this.updated_by
        ? new UserResource(this.updated_by).exec()
        : null,
    };
  }
}

export default CouponResource;
