import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const ProductAttributeSchema = new Schema(
  {
    product_id: {
      type: Types.ObjectId,
      ref: "products",
      required: true,
      index: true,
    },

    attribute_id: {
      type: Types.ObjectId,
      ref: "attributes",
      required: true,
    },

    values: [
      {
        type: Types.ObjectId,
        ref: "attribute_values",
        required: true,
      },
    ],

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    created_by: { type: Types.ObjectId, ref: "users", default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
    deleted_by: { type: Types.ObjectId, ref: "users", default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Unique index to prevent duplicate attribute for same product
ProductAttributeSchema.index(
  { product_id: 1, attribute_id: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);

// Add pagination plugin
ProductAttributeSchema.plugin(mongooseAggregatePaginate);
// Already done:
ProductAttributeSchema.index(
  { product_id: 1, attribute_id: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);

// Export model
const ProductAttribute = model("product_attributes", ProductAttributeSchema);
export default ProductAttribute;
