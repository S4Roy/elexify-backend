import Resource from "resources.js";

class ContactUsResource extends Resource {
  toArray() {
    const lastNote = this.notes?.[this.notes.length - 1];
    const latest = lastNote && (!this.latest_message || new Date(lastNote.created_at) > new Date(this.latest_message.created_at))
      ? { kind: lastNote.kind || 'note', author_name: lastNote.author_name || 'Support team', created_at: lastNote.created_at }
      : this.latest_message;
    return {
      _id: this._id || null,
      name: this.name || null,
      email: this.email || null,
      phone: this.phone || null,
      subject: this.subject || null,
      message: this.message || null,
      status: this.status || 'pending',
      priority: this.priority || 'normal',
      source: this.source || 'web',
      latest_message: latest || null,
      created_at: this.created_at || null,
      created_by: this.created_by || null,
      updated_at: this.updated_at || null,
      updated_by: this.updated_by || null,
      deleted_at: this.deleted_at || null,
      deleted_by: this.deleted_by || null,
    };
  }
}

export default ContactUsResource;
