import { isEnglishCustomerName } from "../validations/customerName.js";
import Resource from "resources.js";

class UserResource extends Resource {
  toArray() {
    let doc = {
      imported_from_backup: this.imported_from_backup === true || this.legacy_import?.source === 'eqstoxco_wp434',
      _id: this._id || null,
      role: this.role || null,
      name: this.name || null,
      requires_name_update: !isEnglishCustomerName(this.name),
      email: this.email || null,
      phone_code: this.phone_code || null,
      mobile: this.mobile || null,
      address: this.address || null,
      status: this.status || null,
      email_verified_at: this.email_verified_at || null,
      mobile_verified_at: this.mobile_verified_at || null,
      created_at: this.created_at || null,
      created_by: this.created_by || null,
      updated_at: this.updated_at || null,
      last_location: this.last_location?.recorded_at ? {
        pincode: this.last_location.pincode || null,
        city: this.last_location.city || null,
        state: this.last_location.state || null,
        serviceable: !!this.last_location.serviceable,
        latitude: this.last_location.latitude ?? null,
        longitude: this.last_location.longitude ?? null,
        accuracy_m: this.last_location.accuracy_m ?? null,
        precise: this.last_location.precise ?? null,
        recorded_at: this.last_location.recorded_at,
      } : null,
    };

    return doc;
  }
}

export default UserResource;
