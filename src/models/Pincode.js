import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";
const { Schema, model } = mongoose;

// One row per Indian postal pincode, imported from the India Post pincode
// directory (see src/scripts/importPincodes.js). Powers two things:
//  1. Address-form auto-fill: pincode -> city/state/country.
//  2. Serviceability: `status` doubles as the admin-configurable
//     include/exclude switch, same convention as Country/State/City —
//     an "inactive" pincode is treated as unserviceable at checkout.
const PincodeSchema = new Schema(
  {
    pincode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Raw source fields, kept for admin display/debugging — not used for
    // matching once city_id/state_id are resolved.
    district: { type: String, default: null },
    source_state_name: { type: String, default: null },
    // Best city-like name derived from India Post taluk/division/region.
    // Retained for diagnostics and as a fallback when master IDs change.
    source_city_name: { type: String, default: null },

    city_id: { type: Number, ref: "cities", default: null },
    state_id: { type: Number, ref: "states", default: null },
    country_id: { type: Number, ref: "countries", default: 101 },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    // Free-text reason an admin can attach when excluding a pincode
    // (e.g. "Out of courier network", "COD not supported here").
    note: { type: String, default: null },
    cod_status: {
      type: String,
      enum: ["use_global", "allowed", "disallowed"],
      default: "use_global",
    },

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: null },
    updated_by: { type: Schema.Types.ObjectId, ref: "users", default: null },
  },
  { versionKey: false },
);

PincodeSchema.index({ status: 1 });
PincodeSchema.index({ state_id: 1 });

PincodeSchema.plugin(mongooseAggregatePaginate);

const Pincode = model("pincodes", PincodeSchema);
export default Pincode;
