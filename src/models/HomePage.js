import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

// config shape depends on `type` (enforced server-side by Joi in
// validations/admin/home/*, not here — Mixed keeps the schema lean per
// section type instead of a giant sparse union):
//   hero             -> { slides: [{desktop_image, mobile_image, heading, description,
//                          primary_cta:{label,link}, secondary_cta:{label,link},
//                          overlay_opacity, order, enabled, schedule:{startAt,endAt}}] }
//   product_section  -> { source_mode: manual|category|latest|bestseller|discounted|featured,
//                          product_ids, category_id, limit, sort_by, sort_order,
//                          view_all_link, countdown_end_at, badge_icon }
//   category_section -> { source_mode: manual|all, category_ids, limit }
//   trust_badges     -> { items: [{icon, label, sub}] }
//   cta_banner       -> { heading, description, button_label, button_link, show_newsletter_panel }
//   content_section  -> { heading, body }
const HomeSectionSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "hero",
        "product_section",
        "category_section",
        "trust_badges",
        "cta_banner",
        "content_section",
      ],
    },
    title: { type: String, default: null },
    subtitle: { type: String, default: null },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    config: { type: Schema.Types.Mixed, default: {} },
    schedule: {
      startAt: { type: Date, default: null },
      endAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

const HomePageSchema = new Schema(
  {
    page: { type: String, default: "home", unique: true },
    // Draft/working copy — what the admin edits.
    sections: [HomeSectionSchema],
    // Last-published snapshot — what the public API serves.
    published_sections: [HomeSectionSchema],
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    seo: {
      meta_title: { type: String, default: null },
      meta_description: { type: String, default: null },
    },
    published_at: { type: Date, default: null },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: false, updatedAt: "updated_at" },
  },
);

HomePageSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ page: "home" });
  if (!doc) {
    doc = await this.create({ page: "home" });
  }
  return doc;
};

const HomePage = model("home_pages", HomePageSchema);
export default HomePage;
