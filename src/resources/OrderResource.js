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
      cod_fee: this.cod_fee || 0,
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
          variation_id: item.variation?._id || null,
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
          regular_price: item.regular_price ?? null,
          sale_price: item.sale_price ?? null,
          discount_percent: item.discount_percent ?? null,
          currency: this.currency || "INR",

          images: MediaResource.collection(item.product?.images || []),
          categories: CategoryResourceMinimal.collection(
            item.product?.categories || []
          ),
          rating_summary: item.rating_summary || null,
        };
      }),
      currency: this.currency || "INR",
      note: this.note || null,
      payment_status: this.payment_status || null,
      payment_meta: this.payment_meta || null,
      paid_at: this.paid_at || null,
      awb: this.awb || null,
      etd: this.etd || null,
      courier_name: this.courier_name || null,
      processing_at: this.processing_at || null,
      shipped_at: this.shipped_at || null,
      delivered_at: this.delivered_at || null,
      stock_reserved: this.stock_reserved || false,
      inventory_reverted: this.inventory_reverted || false,
      cancellation: this.cancellation || null,
      refund: this.refund || null,
      invoice: this.invoice || null,
      created_at: this.created_at || null,
      updated_at: this.updated_at || null,
    };
  }
}

export default OrderResource;
