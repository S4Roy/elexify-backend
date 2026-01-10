import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
import slugify from "slugify";

const { Schema, model, Types } = mongoose;

const ProductSpecificationSchema = new Schema(
  {
    specification_id: {
      type: Types.ObjectId,
      ref: "specifications",
      required: true,
      index: true,
    },
    product_id: {
      type: Types.ObjectId,
      ref: "products",
      required: true,
      index: true,
    },
    variation_id: { type: Types.ObjectId, ref: "product_variations" },
    key: { type: String, required: true, index: true }, // duplicate of master.key for quick queries
    label: { type: String, required: true }, // snapshot label
    value: { type: Schema.Types.Mixed, required: true }, // number/string/object/boolean
    unit: { type: String, default: null }, // unit snapshot
    // optional auxiliary fields useful for filtering/faceting:
    value_string: { type: String, default: null, index: true }, // normalized string
    value_number: { type: Number, default: null, index: true }, // if numeric

    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },

    created_by: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },

    updated_by: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
    deleted_by: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// 🔹 Apply pagination plugin
ProductSpecificationSchema.plugin(mongooseAggregatePaginate);
ProductSpecificationSchema.pre("save", function (next) {
  // keep value_string / value_number in sync for easier filtering
  if (this.value == null) {
    this.value_string = null;
    this.value_number = null;
  } else if (typeof this.value === "number") {
    this.value_number = this.value;
    this.value_string = String(this.value);
  } else if (typeof this.value === "boolean") {
    this.value_number = null;
    this.value_string = String(this.value);
  } else if (typeof this.value === "object") {
    // object (range/dimension): stringify for simple searches
    this.value_number = null;
    try {
      this.value_string = JSON.stringify(this.value);
    } catch {
      this.value_string = String(this.value);
    }
  } else {
    // string
    const vn = Number(this.value);
    this.value_number = Number.isFinite(vn) ? vn : null;
    this.value_string = String(this.value);
  }

  next();
});
// Create model
const ProductSpecification = model(
  "product_specifications",
  ProductSpecificationSchema
);

export default ProductSpecification;
