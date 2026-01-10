import Resource from "resources.js";
import { envs } from "../config/index.js";
import MediaResource from "./MediaResource.js";
class EnquiryResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      custom_id: this.custom_id || null,
      user: this.user || null,
      product_id: this.product_id || null,
      product: this.product || null,
      product_name: this.product_name || null,
      product_images: MediaResource.collection(this.product_images || []),
      variation_id: this.variation_id || null,
      message: this.message || null,
      media: this.media || [],
      name: this.name || null,
      email: this.email || null,
      mobile: this.mobile || null,
      status: this.status || null,
      created_at: this.created_at || null,
      updated_at: this.updated_at || null,
    };

    return doc;
  }
}

export default EnquiryResource;
