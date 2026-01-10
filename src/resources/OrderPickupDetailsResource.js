import Resource from "resources.js";
import UserResource from "./UserResource.js";
import AddressResource from "./AddressResource.js";
import MediaResource from "./MediaResource.js"; // make sure collection() method exists
import CategoryResourceMinimal from "./CategoryResourceMinimal.js"; // make sure collection() method exists

class OrderPickupDetailsResource extends Resource {
  toArray() {
    return {
      _id: this._id || null,
      id: this.id || null,
      transaction_id: this.transaction_id || null,
      order_status: this.order_status || null,
      payment_method: this.payment_method || null,
      payment_status: this.payment_status || null,
      total_amount: this.total_amount || 0,
      shipping: this.shipping || 0,
      discount: this.discount || 0,
      grand_total: this.grand_total || 0,
      user: this.user ? new UserResource(this.user).exec() : null,
      billing_address: this.billing_address
        ? new AddressResource(this.billing_address).exec()
        : null,
      shipping_address: this.shipping_address
        ? new AddressResource(this.shipping_address).exec()
        : null,
      order_items: (this.order_items || []).map((item) => {
        return {
          product_id: item.product_id || null,
          sku: item.sku || null,
          name: item.name || null,
          slug: item.slug || null,
          shipping: item.shipping || null,
          ordered_quantity: item.ordered_quantity || 0,
          packed_quantity: item.packed_quantity || 0,
          current_stock: item.current_stock || 0,
          unit_price: item.unit_price || 0,
          total_price: item.total_price || 0,
          images: MediaResource.collection(item.images || []),
          categories: CategoryResourceMinimal.collection(item.categories || []),
        };
      }),
      note: this.note || null,
      created_at: this.created_at || null,
      updated_at: this.updated_at || null,
    };
  }
}

export default OrderPickupDetailsResource;
