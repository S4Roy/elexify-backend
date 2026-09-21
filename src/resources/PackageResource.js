import Resource from "resources.js";

// Admin-facing package detail — the fuller shape (weight/dims,
// integration_status, last_error, retry/cancel eligibility) used only by
// the admin "Manage Packages" dialog. The customer/storefront-safe summary
// is a separate, narrower shape added directly to OrderResource.packages.
class PackageResource extends Resource {
  toArray() {
    return {
      _id: this._id || null,
      package_number: this.package_number,
      reference_id: this.reference_id || null,
      status: this.status,
      integration_status: this.integration_status,
      items: (this.items || []).map((line) => ({
        order_item_id: line.order_item_id,
        quantity: line.quantity,
      })),
      weight: this.weight,
      length: this.length,
      width: this.width,
      height: this.height,
      pickup_location: this.pickup_location,
      shiprocket_order_id: this.shiprocket_order_id || null,
      shiprocket_shipment_id: this.shiprocket_shipment_id || null,
      awb: this.awb || null,
      shiprocket_status: this.shiprocket_status || null,
      shiprocket_status_updated_at: this.shiprocket_status_updated_at || null,
      courier_name: this.courier_name || null,
      etd: this.etd || null,
      tracking_url: this.tracking_url || null,
      last_error: this.last_error || null,
      attempt_count: this.attempt_count || 0,
      can_retry: ["failed", "unknown"].includes(this.integration_status),
      can_cancel: ["packed", "failed"].includes(this.status),
      shipped_at: this.shipped_at || null,
      delivered_at: this.delivered_at || null,
      cancelled_at: this.cancelled_at || null,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}

export default PackageResource;
