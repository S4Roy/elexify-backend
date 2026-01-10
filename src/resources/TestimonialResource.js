import Resource from "resources.js";

class TestimonialResource extends Resource {
  toArray() {
    let doc = {
      _id: this?._id ?? null,
      name: this?.name ?? null,
      rating: this?.rating ?? null,
      message: this?.message ?? null,
      status: this?.status ?? null,
      created_at: this?.created_at ?? null,
      created_by: this?.created_by ?? null,
      updated_at: this?.updated_at ?? null,
    };

    return doc;
  }
}

export default TestimonialResource;
