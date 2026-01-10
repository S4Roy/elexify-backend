import Resource from "resources.js";
import { envs } from "../config/index.js";
import MediaResource from "./MediaResource.js";
class AddressResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      full_name: this.full_name || null,
      phone_code: this.phone_code || null,
      phone: this.phone || null,
      email: this.email || null,

      address_line_1: this.address_line_1 || null,
      address_line_2: this.address_line_2 || null,
      land_mark: this.land_mark || null,

      city: this.city || null,
      state: this.state || null,
      country: this.country || null,
      postcode: this.postcode || null,

      address_type: this.address_type || "residential",
      purpose: this.purpose || "shipping",
      is_default: this.is_default || false,

      created_at: this.created_at || null,
      updated_at: this.updated_at || null,
    };

    return doc;
  }
}

export default AddressResource;
