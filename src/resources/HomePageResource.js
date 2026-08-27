import Resource from "resources.js";
import SEOResource from "./SEOResource.js";
import CategoryResource from "./CategoryResource.js";
import MediaResource from "./MediaResource.js";
import BrandResource from "./BrandResource.js";
import UserResource from "./UserResource.js";
import ShippingClassResource from "./ShippingClassResource.js";

class HomePageResource extends Resource {
  toArray() {
    return {
      _id: this?._id ?? null,
      title: this?.title ?? null,
      slug: this?.slug ?? null,
      content: this?.content ?? null,
      short_description: this?.short_description ?? null,
      feature_image: this?.feature_image ?? null,
      seo: this?.seo ?? null,
      status: this?.status ?? null,
      created_at: this.created_at || null,
      updated_at: this.updated_at || null,
      categories: CategoryResource.collection(this.categories),
    };
  }
}

export default HomePageResource;
