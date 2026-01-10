import Resource from "resources.js";
import { envs } from "../config/index.js";
class MediaResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      sort_order: this.sort_order || null,
      type: this.type || "",
      mime_type: this.mime_type || "",
      size: this.size || "",
      thumbnail: this.thumbnail || "",
      alt_text: this.alt_text || "",
      is_primary: this.is_primary || false,
      created_at: this.created_at || null,
    };

    if (this.url) {
      doc.url = `${envs.s3.BASE_URL}${this.url}`;
    }

    return doc;
  }
}

export default MediaResource;
