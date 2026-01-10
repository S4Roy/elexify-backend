import Resource from "resources.js";
import ProductResource from "./ProductResource.js";
import UserResource from "./UserResource.js"; // If you want to include user info

class StockTransactionResource extends Resource {
  toArray() {
    let doc = {
      _id: this._id || null,
      product: this.product?._id || this.product || null,
      type: this.type || null, // 'in' or 'out'
      quantity: this.quantity || 0,
      mrp: this.mrp || 0,
      cost_price: this.cost_price || 0,
      selling_price: this.selling_price || 0,
      note: this.note || null,
      created_by: this.created_by?._id || this.created_by || null,
      created_at: this.created_at || null,
    };

    // Optionally expand related resources
    if (this.product && typeof this.product === "object") {
      doc.product = new ProductResource(this.product).exec();
    }

    if (this.created_by && typeof this.created_by === "object") {
      doc.created_by = new UserResource(this.created_by).exec();
    }

    return doc;
  }
}

export default StockTransactionResource;
