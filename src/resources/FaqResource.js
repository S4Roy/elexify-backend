import Resource from "resources.js";

class FaqResource extends Resource {
  toArray() {
    return {
      _id: this?._id ?? null,
      question: this?.question ?? null,
      answer: this?.answer ?? null,
      category: this?.category ?? null, // optional grouping
      status: this?.status ?? null,
      created_at: this?.created_at ?? null,
      created_by: this?.created_by ?? null,
      updated_at: this?.updated_at ?? null,
    };
  }
}

export default FaqResource;
