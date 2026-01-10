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
    meta_title: { type: String, trim: true, required: true },
    meta_description: { type: String, trim: true, default: null },
    meta_keywords: [{ type: String, trim: true, lowercase: true }],
    canonical_url: { type: String, default: null },

    // ✅ Open Graph (OG) for Facebook & Social Sharing
    og_title: {
      type: String,
      default: function () {
        return this.meta_title;
      },
    },
    og_description: {
      type: String,
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
      default: function () {
        return this.meta_title;
      },
    },
    twitter_description: {
      type: String,
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

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// 🔹 Indexing for faster queries
SEOSchema.index({ reference_id: 1, reference_type: 1 });

const SEO = model("seo", SEOSchema);
export default SEO;
