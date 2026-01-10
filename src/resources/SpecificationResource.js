import Resource from "resources.js";
class SpecificationResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      key: this.key || null,
      label: this.label || null,
      type: this.type || null,
      sort_order: this.sort_order || null,
      options: this.options || [],
      validation: this.validation || null,
      required: this.required || false,
      visible: this.visible || false,
      status: this.status || null,
      updated_at: this.updated_at || null,
      created_at: this.created_at || null,
    };

    return doc;
  }
}

export default SpecificationResource;
