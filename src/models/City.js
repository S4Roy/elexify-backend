import mongoose from "mongoose";
const { Schema, model } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const CitySchema = new Schema(
  {
    // Numeric ID from external dataset (optional but useful)
    id: { type: Number, index: true },

    // City or town name
    name: { type: String, required: true, trim: true, index: true },

    // References to parent country
    country_id: { type: Number, required: true, index: true },
    country_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    country_name: { type: String, required: true, trim: true },

    // References to parent state/province
    state_id: { type: Number, required: true, index: true },
    state_code: { type: String, trim: true, uppercase: true, default: null },
    state_name: { type: String, trim: true, default: null },

    // Geographic coordinates (stored as strings for precision)
    latitude: { type: String, trim: true, default: null },
    longitude: { type: String, trim: true, default: null },

    // Optional link to Wikidata or geoname
    wikiDataId: { type: String, trim: true, default: null },

    // Status for filtering
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },

    // Optional metadata
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    versionKey: false,
    collection: "cities",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Common indexes for lookup speed
CitySchema.index({ country_code: 1, state_code: 1, name: 1 });
CitySchema.index({ id: 1 });
CitySchema.index({ name: "text" });

// Plugin for aggregate pagination
CitySchema.plugin(mongooseAggregatePaginate);

const City = model("cities", CitySchema);
export default City;
