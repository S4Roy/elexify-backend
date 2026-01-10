import Resource from "resources.js";
import SEOResource from "./SEOResource.js";
import CategoryResourceMinimal from "./CategoryResourceMinimal.js";
import MediaResource from "./MediaResource.js";
import BrandResource from "./BrandResource.js";
import UserResource from "./UserResource.js";
import ShippingClassResource from "./ShippingClassResource.js";
import TagResource from "./TagResource.js";
import ClassificationResource from "./ClassificationResource.js";

class ProductResource extends Resource {
  toArray() {
    return {
      variation_id: this.variation_id || null,
      _id: this._id || null,
      slug: this.slug || null,
      name: this.name || null,
      type: this.type || "simple",
      power_level: this.power_level || 0,
      rarity: this.rarity || "",
      sku: this.sku || null,
      ask_for_price: this.ask_for_price || false,
      enable_enquiry: this.enable_enquiry || false,
      description: this.description || null,
      short_description: this.short_description || null,

      regular_price: this.regular_price ?? 0,
      sale_price: this.sale_price ?? null,
      stock_quantity: this.stock_quantity ?? 0,
      stock_status: this.stock_status,
      allow_backorders: this.allow_backorders || false,
      manage_stock: this.manage_stock || true,
      sold_individually: this.sold_individually || false,

      weight: this.weight ?? 0,
      dimensions: {
        length: this.dimensions?.length ?? 0,
        width: this.dimensions?.width ?? 0,
        height: this.dimensions?.height ?? 0,
      },

      brand: this.brand ? new BrandResource(this.brand).exec() : null,
      categories: CategoryResourceMinimal.collection(this.categories),
      sub_categories: CategoryResourceMinimal.collection(this.sub_categories),
      tags: TagResource.collection(this.tags),
      classifications: ClassificationResource.collection(this.classifications),

      images: MediaResource.collection(this.images || []),

      seo: this.seo ? new SEOResource(this.seo).exec() : null,
      shipping_class: this.shipping_class
        ? new ShippingClassResource(this.shipping_class).exec()
        : null,

      attributes: Array.isArray(this.attributes) ? this.attributes : [],

      is_wishlist: this.wishlist?._id ? true : false,
      is_carted: this.cart?._id ? true : false,
      cart_quantity: this.cart?.quantity || 0,

      status: this.status || "active",
      created_at: this.created_at || null,
      updated_at: this.updated_at || null,
      created_by: this.created_by
        ? new UserResource(this.created_by).exec()
        : null,
      updated_by: this.updated_by
        ? new UserResource(this.updated_by).exec()
        : null,
      variations: this.variations || [],
    };
  }
}

export default ProductResource;
