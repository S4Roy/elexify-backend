import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const SEOSchema = new Schema(
  {
    reference_id: {
      type: Types.ObjectId,
      refPath: "reference_type", // Dynamic reference
      default: null, // Allows initial upload without reference
    },
    reference_type: {
      type: String,
      enum: ["products", "categories", "blogs", "pages"],
      required: true,
    },

    // ✅ Basic Meta Tags
    // Length caps follow current SERP/social-card truncation behavior:
    // meta_title/og_title/twitter_title ~55-60 chars is where Google
    // truncates search result titles (Twitter Cards truncate at 70);
    // meta/og/twitter descriptions ~155-160 chars is where Google truncates
    // snippets, with a little extra headroom for social previews.
    meta_title: { type: String, trim: true, required: true, maxlength: 60 },
    meta_description: { type: String, trim: true, default: null, maxlength: 160 },
    meta_keywords: [{ type: String, trim: true, lowercase: true, maxlength: 80 }],
    canonical_url: { type: String, default: null, maxlength: 2048 },

    // ✅ Open Graph (OG) for Facebook & Social Sharing
    og_title: {
      type: String,
      maxlength: 70,
      default: function () {
        return this.meta_title;
      },
    },
    og_description: {
      type: String,
      maxlength: 200,
      default: function () {
        return this.meta_description;
      },
    },
    og_image: { type: String, default: null },
    og_type: {
      type: String,
      enum: ["website", "article", "product"],
      default: "website",
    },

    // ✅ Twitter Meta Tags
    twitter_title: {
      type: String,
      maxlength: 70,
      default: function () {
        return this.meta_title;
      },
    },
    twitter_description: {
      type: String,
      maxlength: 200,
      default: function () {
        return this.meta_description;
      },
    },
    twitter_image: { type: String, default: null },
    twitter_card: {
      type: String,
      enum: ["summary", "summary_large_image"],
      default: "summary",
    },

    // ✅ JSON-LD Structured Data (for SEO)
    json_ld: { type: String, default: null }, // Store JSON-LD schema markup as a string

    // ✅ Focus keyword & indexing control
    focus_keyword: { type: String, trim: true, default: null, maxlength: 100 },
    robots: {
      type: String,
      enum: ["index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"],
      default: "index,follow",
    },
    schema_enabled: { type: Boolean, default: true },

    // ✅ Generation metadata — lets bulk generation skip hand-edited fields
    generated: { type: Boolean, default: false },
    generated_at: { type: Date, default: null },
    generated_by: { type: Types.ObjectId, ref: "users", default: null },
    title_manually_edited: { type: Boolean, default: false },
    description_manually_edited: { type: Boolean, default: false },
    focus_keyword_manually_edited: { type: Boolean, default: false },

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// 🔹 Indexing for faster queries
SEOSchema.index({ reference_id: 1, reference_type: 1 });

const SEO = model("seo", SEOSchema);
export default SEO;
