import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const PageSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    content: {
      type: String, // Use rich text (HTML/Markdown) or structured JSON if needed
    },
    extra: {
      categories: [{ type: Types.ObjectId, ref: "categories" }],
      images: [{ type: Types.ObjectId, ref: "medias" }],
    },
    seo: {
      type: Types.ObjectId,
      ref: "seo", // 🔹 Reference to SEO Model
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    created_at: { type: Date, default: Date.now },
    created_by: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
    },
    updated_at: { type: Date, default: Date.now },
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

// 🔹 Indexing for faster queries

const Page = model("pages", PageSchema);
export default Page;
