import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const TagSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
      default: null,
    },
    image: {
      type: Types.ObjectId,
      ref: "medias", // 🔹 Reference to Media Model
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    created_by: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },
    updated_at: {
      type: Date,
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
  { versionKey: false }
);

// Apply pagination plugin
TagSchema.plugin(mongooseAggregatePaginate);
TagSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
TagSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
// Create model
const Tag = model("tags", TagSchema);

export default Tag;
