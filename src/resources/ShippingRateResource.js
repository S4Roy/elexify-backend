import Resource from "resources.js";
import ShippingZoneResource from "./ShippingZoneResource.js";
import ShippingClassResource from "./ShippingClassResource.js";
import UserResource from "./UserResource.js";

class ShippingRateResource extends Resource {
  toArray() {
    return {
      _id: this._id || null,
      zone:
        this.zone && this.zone.name
          ? new ShippingZoneResource(this.zone).exec()
          : this.zone || null,
      shipping_class:
        this.shipping_class && this.shipping_class.name
          ? new ShippingClassResource(this.shipping_class).exec()
          : this.shipping_class || null,
      flat_rate: this.flat_rate ?? 0,
      per_kg_rate: this.per_kg_rate ?? 0,
      free_weight_kg: this.free_weight_kg ?? 0,
      free_shipping_min_order_value: this.free_shipping_min_order_value ?? null,
      min_delivery_days: this.min_delivery_days ?? null,
      max_delivery_days: this.max_delivery_days ?? null,
      status: this.status || null,
      updated_at: this.updated_at || null,
      created_at: this.created_at || null,
      created_by: this.created_by
        ? new UserResource(this.created_by).exec()
        : null,
      updated_by: this.updated_by
        ? new UserResource(this.updated_by).exec()
        : null,
    };
  }
}

export default ShippingRateResource;
