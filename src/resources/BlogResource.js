import Resource from "resources.js";
import { envs } from "../config/index.js";
import SEOResource from "./SEOResource.js";
import MediaResource from "./MediaResource.js";
import UserResource from "./UserResource.js";
class BlogResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      title: this.title || null,
      slug: this.slug || null,
      short_description: this.short_description || null,
      content: this.content || null,
      status: this.status || null,
      tags: this.tags || [],
      related_blogs: BlogResource.collection(this.related_blogs || []),
      feature_image: this.feature_image
        ? new MediaResource(this.feature_image).exec()
        : { url: envs.NO_IMAGE },
      gallery: MediaResource.collection(this.gallery || []),
      seo: this.seo ? new SEOResource(this.seo).exec() : null,
      created_by: this.created_by
        ? new UserResource(this.created_by).exec()
        : null,
      updated_by: this.updated_by
        ? new UserResource(this.updated_by).exec()
        : null,
      updated_at: this.updated_at || null,
      created_at: this.created_at || null,
    };

    return doc;
  }
}

export default BlogResource;
