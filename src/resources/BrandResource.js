import Resource from "resources.js";
import { envs } from "../config/index.js";
import MediaResource from "./MediaResource.js";
import UserResource from "./UserResource.js";
class BrandResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      slug: this.slug || null,
      name: this.name || null,
      status: this.status || null,
      products: this.products || null,
      parent_brand: new BrandResource(this.parent_brand).exec() || null,
      image: this.image
        ? new MediaResource(this.image).exec()
        : { url: envs.NO_IMAGE },
      updated_at: this.updated_at || null,
      created_at: this.created_at || null,
      created_by: new UserResource(this.created_by).exec() || null,
      updated_by: new UserResource(this.updated_by).exec() || null,
    };

    return doc;
  }
}

export default BrandResource;
