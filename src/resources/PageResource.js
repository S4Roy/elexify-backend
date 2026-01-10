import Resource from "resources.js";

class PageResource extends Resource {
  toArray() {
    let doc = {
      _id: this?._id ?? null,
      title: this?.title ?? null,
      slug: this?.slug ?? null,
      extra: this?.extra ?? null,
      content: this?.content ?? null,
      status: this?.status ?? null,
      created_at: this?.created_at ?? null,
      created_by: this?.created_by ?? null,
      updated_at: this?.updated_at ?? null,
    };

    return doc;
  }
}

export default PageResource;
