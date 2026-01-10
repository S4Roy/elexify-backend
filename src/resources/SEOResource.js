import Resource from "resources.js";
import { envs } from "../config/index.js";
import UserResource from "./UserResource.js";

class SEOResource extends Resource {
  toArray() {
    return {
      _id: this._id || null,
      meta_title: this.meta_title || null,
      meta_description: this.meta_description || null,
      meta_keywords: this.meta_keywords || [], // Ensure array format
      canonical_url: this.canonical_url || null,
      status: this.status || "active",
      created_at: this.created_at || null,
      // created_by: this.created_by ? new UserResource(this.created_by).exec() : null,
      image_path: this.image ? `${envs.s3.BASE_URL}${this.image}` : null,
    };
  }
}

export default SEOResource;
