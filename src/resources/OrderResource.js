import Resource from "resources.js";
import UserResource from "./UserResource.js";
import AddressResource from "./AddressResource.js";
import MediaResource from "./MediaResource.js"; // make sure this handles collections
import CategoryResourceMinimal from "./CategoryResourceMinimal.js"; // make sure collection() method exists

class OrderResource extends Resource {
  toArray() {
    return {
      _id: this._id || null,
      id: this.id || null,
      shiprocket_order_id: this.shiprocket_order_id || null,
      transaction_id: this.transaction_id || null,
      order_status: this.order_status || null,
      payment_method: this.payment_method || null,
      payment_status: this.payment_status || null,
      total_items: this.total_items || 0,
      total_amount: this.total_amount || 0,
      shipping: this.shipping || 0,
      discount: this.discount || 0,
      grand_total: this.grand_total || 0,
      payment_method: this.payment_method || null,
      user: this.user ? new UserResource(this.user).exec() : null,
      billing_address: this.billing_address
        ? new AddressResource(this.billing_address).exec()
        : null,
      shipping_address: this.shipping_address
        ? new AddressResource(this.shipping_address).exec()
        : null,
      order_items: (this.order_items || []).map((item) => {
        return {
          product_id: item.product?._id || null,
          sku: item.product?.sku || item.variation?.sku,
          display_name: item.display_name || null,
          name: item.product?.name || null,
          slug: item.product?.slug || null,
          shipping: item.product?.shipping || null,
          customization: item?.customization || null,
          quantity: item?.quantity || 0,
          current_stock: item.current_stock || 0,
          unit_price: item.unit_price || 0,
          total_price: item.total_price || 0,
          currency: this.currency || "INR",

          images: MediaResource.collection(item.product?.images || []),
          categories: CategoryResourceMinimal.collection(
            item.product?.categories || []
          ),
        };
      }),
      currency: this.currency || "INR",
      note: this.note || null,
      payment_status: this.payment_status || null,
      payment_meta: this.payment_meta || null,
      created_at: this.created_at || null,
      updated_at: this.updated_at || null,
    };
  }
}

export default OrderResource;
