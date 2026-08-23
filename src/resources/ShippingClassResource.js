import Resource from "resources.js";
import UserResource from "./UserResource.js";

class ShippingClassResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      slug: this.slug || null,
      name: this.name || null,
      description: this.description || null,
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

    return doc;
  }
}

export default ShippingClassResource;
