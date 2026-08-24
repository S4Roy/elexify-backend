import Resource from "resources.js";
import { envs } from "../config/index.js";
import MediaResource from "./MediaResource.js";
import UserResource from "./UserResource.js";

class CategoryResource extends Resource {
  toArray() {
    const doc = {
      _id: this._id || null,
      slug: this.slug || null,
      name: this.name || null,
      description: this.description || null,
      banner_tag_line: this.banner_tag_line || null,
      is_featured: this.is_featured ?? false,
      status: this.status || null,
      products: this.products || 0,
      child_count: this.child_count ?? null,
      has_children: this.has_children ?? 0,
      parent_category: this.parent_category
        ? new CategoryResource(this.parent_category).exec()
        : null,
      image: this.image
        ? new MediaResource(this.image).exec()
        : { url: envs.NO_IMAGE },
      banner: this.banner
        ? new MediaResource(this.banner).exec()
        : { url: envs.NO_IMAGE },

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

export default CategoryResource;
