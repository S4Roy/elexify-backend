import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const NavigationMenuSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, default: null },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    published_at: { type: Date, default: null },
    created_by: { type: Types.ObjectId, ref: "users", default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
    deleted_by: { type: Types.ObjectId, ref: "users", default: null },
    deleted_at: { type: Date, default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

NavigationMenuSchema.plugin(mongooseAggregatePaginate);
NavigationMenuSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } },
);

const NavigationMenu = model("navigation_menus", NavigationMenuSchema);
export default NavigationMenu;
