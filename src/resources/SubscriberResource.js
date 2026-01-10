import Resource from "resources.js";

class SubscriberResource extends Resource {
  toArray() {
    return {
      _id: this._id || null,
      email: this.email || null,
      ip: this.ip || null,
      user_agent: this.user_agent || null,
      status: this.status || null, // e.g., pending, approved, completed
      created_at: this.created_at || null,
      created_by: this.created_by || null,
      updated_at: this.updated_at || null,
      updated_by: this.updated_by || null,
      deleted_at: this.deleted_at || null,
      deleted_by: this.deleted_by || null,
    };
  }
}

export default SubscriberResource;
