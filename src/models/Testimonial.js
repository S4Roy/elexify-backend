import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const TestimonialSchema = new Schema(
  {
    // Linked user (optional, for logged-in customers giving feedback)
    user: {
      type: Types.ObjectId,
      ref: "users",
      required: false,
      default: null,
    },

    // Basic info
    name: {
      type: String,
      required: true,
      trim: true,
    },
    designation: {
      type: String, // e.g. "Doctor", "Entrepreneur"
      trim: true,
    },
    company: {
      type: String,
      trim: true,
    },

    // Content
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },

    // Avatar / profile picture
    avatar: {
      url: String,
      alt: String,
    },

    // ✅ Source type: manual or Google
    source: {
      type: String,
      enum: ["manual", "google"],
      default: "manual",
    },

    // ✅ If Google review
    google_review_id: { type: String, default: null },
    google_profile_url: { type: String, default: null },

    // Status
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Auditing
    created_at: { type: Date, default: Date.now },
    created_by: { type: Types.ObjectId, ref: "users", default: null },
    updated_at: { type: Date, default: Date.now },
    updated_by: { type: Types.ObjectId, ref: "users", default: null },
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
TestimonialSchema.plugin(mongooseAggregatePaginate);

const Testimonial = model("testimonials", TestimonialSchema);
export default Testimonial;
