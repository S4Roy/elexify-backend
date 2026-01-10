import Resource from "resources.js";

class ConsultationResource extends Resource {
  toArray() {
    return {
      _id: this._id || null,
      type: this.type || null, // free or paid
      name: this.name || null,
      email: this.email || null,
      phone: this.phone || null,
      gender: this.gender || null,
      dob: this.dob || null,
      time: this.time || null,
      place: this.place || null,
      occupation: this.occupation || null,
      purpose: this.purpose || null,
      postcode: this.postcode || null,
      current_address: this.current_address || null,
      status: this.status || null, // e.g., pending, approved, completed
      payment: this.payment || {},
      created_at: this.created_at || null,
      created_by: this.created_by || null,
      updated_at: this.updated_at || null,
      updated_by: this.updated_by || null,
      deleted_at: this.deleted_at || null,
      deleted_by: this.deleted_by || null,
    };
  }
}

export default ConsultationResource;
