import Resource from "resources.js";
import { envs } from "../config/index.js";
import ProductResource from "./ProductResource.js";

class CartResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      price: this.product?.sale_price || this.product?.regular_price || 0,
      total_price: this.total_price || 0,
      quantity: this.quantity || null,
      product: new ProductResource(this.product).exec() || null,
    };
    return doc;
  }
}

export default CartResource;
