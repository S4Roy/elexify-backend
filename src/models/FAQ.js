import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const FAQSchema = new Schema(
  {
    // Question
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    // Answer
    answer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    // Category (optional, like "Orders", "Payments", "General")
    category: {
      type: String,
      trim: true,
      default: "General",
    },

    // Order for frontend sorting
    order: {
      type: Number,
      default: 0,
    },

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
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  { versionKey: false }
);

FAQSchema.plugin(mongooseAggregatePaginate);

const FAQ = model("faqs", FAQSchema);
export default FAQ;
