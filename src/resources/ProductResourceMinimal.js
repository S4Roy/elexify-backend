import Resource from "resources.js";
import { envs } from "../config/index.js";
import MediaResource from "./MediaResource.js";
import UserResource from "./UserResource.js";
class ProductResourceMinimal extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      slug: this.slug || null,
      name: this.name || null,
    };

    return doc;
  }
}

export default ProductResourceMinimal;
