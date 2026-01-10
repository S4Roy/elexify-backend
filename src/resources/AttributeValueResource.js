import Resource from "resources.js";
import { envs } from "../config/index.js";
import MediaResource from "./MediaResource.js";
import UserResource from "./UserResource.js";
class AttributeValueResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      attribute_id: this.attribute_id || null,
      slug: this.slug || null,
      name: this.name || null,
      visible_in_list: this.visible_in_list || false,
      description: this.description || null,
      status: this.status || null,
      hex: this.hex || null,
      meta: this.meta || null,
      sort_order: this.sort_order || null,
      // ⭐ NEW PRICE FIELDS ⭐
      price_modifier: this.price_modifier || 0,
      price_type: this.price_type || "fixed",
      image: this.image
        ? new MediaResource(this.image).exec()
        : { url: envs.NO_IMAGE },
    };

    return doc;
  }
}

export default AttributeValueResource;
