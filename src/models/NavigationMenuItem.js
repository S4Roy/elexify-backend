import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const MegaMenuLinkSchema = new Schema(
  {
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["category", "product", "custom_url", "internal_page"],
      required: true,
    },
    reference_id: { type: Types.ObjectId, default: null },
    custom_url: { type: String, default: null },
    order: { type: Number, default: 0 },
    badge: {
      text: { type: String, default: null },
      color: { type: String, default: null },
    },
  },
  { _id: false },
);

const MegaMenuColumnSchema = new Schema(
  {
    heading: { type: String, default: null },
    order: { type: Number, default: 0 },
    links: [MegaMenuLinkSchema],
  },
  { _id: false },
);

// Embedded on the item rather than a separate collection — see model design
// note: avoids an extra $lookup per mega-menu node on a per-page-load
// endpoint. Only meaningful when type === "mega_menu".
const MegaMenuContentSchema = new Schema(
  {
    layout: {
      type: String,
      enum: ["columns", "columns_with_promo", "single_promo"],
      default: "columns",
    },
    columns: [MegaMenuColumnSchema],
    promo: {
      image: { type: Types.ObjectId, ref: "medias", default: null },
      heading: { type: String, default: null },
      subtext: { type: String, default: null },
      link: { type: String, default: null },
      order: { type: Number, default: 0 },
    },
  },
  { _id: false },
);

const NavigationMenuItemSchema = new Schema(
  {
    menu_id: { type: Types.ObjectId, ref: "navigation_menus", required: true, index: true },
    parent_id: { type: Types.ObjectId, ref: "navigation_menu_items", default: null, index: true },
    type: {
      type: String,
      required: true,
      enum: [
        "internal_page",
        "product",
        "category",
        "collection",
        "blog",
        "custom_url",
        "external_url",
        "mega_menu",
        "dropdown",
        "cta",
      ],
    },
    label: { type: String, required: true },
    icon: { type: String, default: null },
    badge: {
      text: { type: String, default: null },
      color: { type: String, default: null },
    },
    // Populated for types: internal_page, product, category, collection, blog.
    // "collection" resolves against `categories` too — see model design note,
    // no dedicated Collection model exists in this codebase.
    reference_id: { type: Types.ObjectId, refPath: "reference_model", default: null },
    reference_model: {
      type: String,
      // `null` must be listed explicitly — Mongoose's enum validator does not
      // skip an explicitly-assigned `null` the way it skips `undefined`, and
      // types like custom_url/external_url/mega_menu/dropdown/cta legitimately
      // save `reference_model: null` (confirmed via live testing).
      enum: ["pages", "products", "categories", "blogs", null],
      default: null,
    },
    // Populated for types: custom_url, external_url, cta.
    custom_url: { type: String, default: null },
    target: { type: String, enum: ["_self", "_blank"], default: "_self" },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    schedule: {
      startAt: { type: Date, default: null },
      endAt: { type: Date, default: null },
    },
    mega_menu_content: { type: MegaMenuContentSchema, default: null },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    // Draft/publish mechanics: publish() snapshots this item's own publishable
    // fields here via one bulkWrite, so draft-side item IDs stay meaningful
    // for the published tree (see NavigationMenu.publish design note).
    is_published: { type: Boolean, default: false },
    published_snapshot: { type: Schema.Types.Mixed, default: null },
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

NavigationMenuItemSchema.plugin(mongooseAggregatePaginate);
NavigationMenuItemSchema.index({ menu_id: 1, parent_id: 1 });
NavigationMenuItemSchema.index({ menu_id: 1, order: 1 });
NavigationMenuItemSchema.index({ reference_id: 1 }, { sparse: true });

const NavigationMenuItem = model("navigation_menu_items", NavigationMenuItemSchema);
export default NavigationMenuItem;
