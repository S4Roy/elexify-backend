import Resource from "resources.js";
import UserResource from "./UserResource.js";

class ShippingZoneResource extends Resource {
  toArray() {
    return {
      _id: this._id || null,
      name: this.name || null,
      countries: this.countries || [],
      states: this.states || [],
      pincode_prefixes: this.pincode_prefixes || [],
      is_default: this.is_default || false,
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

export default ShippingZoneResource;
