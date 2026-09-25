import { customerContact } from "../helpers/order/customerContact.js";
import Resource from "resources.js";
import UserResource from "./UserResource.js";
import AddressResource from "./AddressResource.js";
import MediaResource from "./MediaResource.js"; // make sure this handles collections
import CategoryResourceMinimal from "./CategoryResourceMinimal.js"; // make sure collection() method exists

class OrderResource extends Resource {
  toArray() {
    return {
      imported_from_backup: this.imported_from_backup === true || this.legacy_import?.source === 'eqstoxco_wp434',
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
      is_partial_cod: this.is_partial_cod || false,
      advance_amount: this.advance_amount || 0,
      cod_due_amount: this.cod_due_amount || 0,
      // Multi-package fulfillment. package_count/fully_packed are
      // denormalized onto Order itself (cheap list-view gating); `packages`
      // is a customer/admin-safe summary attached only on the order-detail
      // aggregation (src/controllers/{admin,site}/inventory/order/list.js) —
      // empty on the paginated list view, matching today's order-level-only
      // list display.
      package_count: this.package_count || 0,
      fully_packed: this.fully_packed || false,
      packages: (this.packages || []).map((pkg) => ({
        reference_id: pkg.reference_id || null,
        package_number: pkg.package_number,
        status: pkg.status,
        shiprocket_status: pkg.shiprocket_status || null,
        shiprocket_status_updated_at: pkg.shiprocket_status_updated_at || null,
        courier_name: pkg.courier_name || null,
        awb: pkg.awb || null,
        etd: pkg.etd || null,
        tracking_url: pkg.tracking_url || null,
        item_count: pkg.item_count || 0,
        ...(pkg.items ? { items: pkg.items.map((line) => ({
          order_item_id: line.order_item_id,
          quantity: line.quantity,
        })) } : {}),
        tracking_events: pkg.tracking_events || [],
        shipped_at: pkg.shipped_at || null,
        delivered_at: pkg.delivered_at || null,
        created_at: pkg.created_at || null,
        cancelled_at: pkg.cancelled_at || null,
      })),
      payment_method: this.payment_method || null,
      customer_contact: customerContact(this),
      user: this.user ? new UserResource(this.user).exec() : null,
      billing_address: this.billing_address
        ? new AddressResource(this.billing_address).exec()
        : null,
      shipping_address: this.shipping_address
        ? new AddressResource(this.shipping_address).exec()
        : null,
      order_items: (this.order_items || []).map((item) => {
        return {
          _id: item._id || null,
          product_id: item.product?._id || null,
          variation_id: item.variation?._id || null,
          sku: item.product?.sku || item.variation?.sku,
          weight: item.variation?.weight ?? item.product?.weight ?? null,
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
          packed_quantity: item.packed_quantity || 0,
          shipped_quantity: item.shipped_quantity || 0,
          unpacked_quantity: Math.max(0, (item?.quantity || 0) - (item.packed_quantity || 0)),

          images: MediaResource.collection(item.product?.images || []),
          categories: CategoryResourceMinimal.collection(
            item.product?.categories || []
          ),
          rating_summary: item.rating_summary ? {
            ...item.rating_summary,
            user_review: item.rating_summary.user_review ? {
              ...item.rating_summary.user_review,
              media: MediaResource.collection(item.rating_summary.user_review.media || []),
            } : null,
          } : null,
        };
      }),
      currency: this.currency || "INR",
      note: this.note || null,
      payment_status: this.payment_status || null,
      payment_meta: this.payment_meta || null,
      paid_at: this.paid_at || null,
      awb: this.awb || null,
      etd: this.etd || null,
      shiprocket_status: this.shiprocket_status || null,
      shiprocket_status_updated_at: this.shiprocket_status_updated_at || null,
      courier_name: this.courier_name || null,
      confirmed_at: this.confirmed_at || null,
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
