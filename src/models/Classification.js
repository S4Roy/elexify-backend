import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const ClassificationSchema = new Schema(
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
ClassificationSchema.plugin(mongooseAggregatePaginate);
ClassificationSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
ClassificationSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
// Create model
const Classification = model("classifications", ClassificationSchema);

export default Classification;
