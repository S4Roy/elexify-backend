import Resource from "resources.js";
import { envs } from "../config/index.js";
import MediaResource from "./MediaResource.js";
class RatingResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      user: this.user || null,
      product_id: this.product_id || null,
      product: this.product || null,
      product_images: MediaResource.collection(this.product_images || []),
      variation_id: this.variation_id || null,
      rating: this.rating || null,
      title: this.title || null,
      description: this.description || null,
      media: this.media || [],
      status: this.status || null,
      created_at: this.created_at || null,
      updated_at: this.updated_at || null,
    };

    return doc;
  }
}

export default RatingResource;
