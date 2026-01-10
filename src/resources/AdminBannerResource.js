import Resource from "resources.js";
import { envs } from "../config/index.js";
import MediaResource from "./MediaResource.js";
class AdminBannerResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      title: this.title || null,
      cta_label: this.cta_label || null,
      cta_link: this.cta_link || null,
      description: this.description || null,
      status: this.status || null,
      image: this.image
        ? new MediaResource(this.image).exec()
        : { url: envs.NO_IMAGE },
      updated_at: this.updated_at || null,
      created_at: this.created_at || null,
    };

    return doc;
  }
}

export default AdminBannerResource;
