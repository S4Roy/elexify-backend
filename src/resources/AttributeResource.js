import Resource from "resources.js";
import { envs } from "../config/index.js";
import AttributeValueResource from "./AttributeValueResource.js";
import UserResource from "./UserResource.js";
class AttributeResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      slug: this.slug || null,
      name: this.name || null,
      visible_in_list: this.visible_in_list || false,
      customized_mala_mukhi: this.customized_mala_mukhi || false,
      customized_mala_design: this.customized_mala_design || false,
      customized_mala_type: this.customized_mala_type || false,
      size_meta: this.size_meta || false,
      sort_order: this.sort_order || null,
      description: this.description || null,
      display_type: this.display_type || null,
      values_sort_by: this.values_sort_by || null,
      status: this.status || null,
      values: AttributeValueResource.collection(this.values || []),
      updated_at: this.updated_at || null,
      created_at: this.created_at || null,
      created_by: new UserResource(this.created_by).exec() || null,
      updated_by: new UserResource(this.updated_by).exec() || null,
    };

    return doc;
  }
}

export default AttributeResource;
