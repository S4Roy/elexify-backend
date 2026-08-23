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
      focus_keyword: this.focus_keyword || null,
      robots: this.robots || "index,follow",
      schema_enabled: this.schema_enabled ?? true,
      og_title: this.og_title || null,
      og_description: this.og_description || null,
      og_image: this.og_image || null,
      twitter_title: this.twitter_title || null,
      twitter_description: this.twitter_description || null,
      twitter_image: this.twitter_image || null,
      generated: this.generated || false,
      generated_at: this.generated_at || null,
      title_manually_edited: this.title_manually_edited || false,
      description_manually_edited: this.description_manually_edited || false,
      focus_keyword_manually_edited: this.focus_keyword_manually_edited || false,
      status: this.status || "active",
      created_at: this.created_at || null,
      // created_by: this.created_by ? new UserResource(this.created_by).exec() : null,
      image_path: this.image ? `${envs.s3.BASE_URL}${this.image}` : null,
    };
  }
}

export default SEOResource;
