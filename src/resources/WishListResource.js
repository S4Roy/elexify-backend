import Resource from "resources.js";
import { envs } from "../config/index.js";
import ProductResource from "./ProductResource.js";

class WishListResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      product: new ProductResource(this.product).exec() || null,
    };
    return doc;
  }
}

export default WishListResource;
