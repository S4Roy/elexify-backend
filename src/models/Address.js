import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const AddressSchema = new Schema(
  {
    user: { type: mongoose.Types.ObjectId, ref: "users", required: true },
    full_name: { type: String, required: true },
    phone_code: { type: String },
    phone: { type: String, required: true },
    email: { type: String },

    address_line_1: { type: String, required: true },
    address_line_2: { type: String },
    land_mark: { type: String },

    city: { type: Number, required: true, ref: "cities" },
    state: { type: Number, required: true, ref: "states" },
    country: {
      type: Number,
      required: true,
      default: 101,
      ref: "countries",
    },
    postcode: { type: String, required: true },

    address_type: {
      type: String,
      enum: ["residential", "business", "other"],
      default: "residential",
    },
    purpose: {
      type: String,
      enum: ["shipping", "billing", "both"],
      default: "shipping",
    },
    is_default: { type: Boolean, default: false },
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    created_at: {
      type: Date,
      default: Date.now,
      immutable: true, // Prevents modification
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
AddressSchema.plugin(mongooseAggregatePaginate);

// Create model
const Address = model("address", AddressSchema);

export default Address;
