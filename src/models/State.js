import mongoose from "mongoose";
const { Schema, model } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const StateSchema = new Schema(
  {
    // internal numeric ID (if you want to preserve the source dataset's ID)
    id: { type: Number, index: true },

    // name of the state/province
    name: { type: String, required: true, trim: true, index: true },

    // ISO 3166-2 subdivision code, e.g., "AF-BDS"
    iso3166_2: { type: String, trim: true, uppercase: true, default: null },

    // sometimes used as ISO2 for short codes (e.g., "BDS")
    iso2: { type: String, trim: true, uppercase: true, default: null },

    // FIPS code (legacy US government code system, optional)
    fips_code: { type: String, trim: true, default: null },

    // references the parent country (numeric id from dataset)
    country_id: { type: Number, required: true, index: true },

    // ISO 3166 alpha-2 code for the country, e.g., "AF"
    country_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    // human-readable country name
    country_name: { type: String, required: true, trim: true },

    // hierarchical level or nesting (rarely used in this dataset)
    level: { type: Number, default: null },

    // parent region ID if nested states exist (optional)
    parent_id: { type: Number, default: null },

    // type of region (e.g., province, state, region)
    type: { type: String, trim: true, default: "state" },

    // coordinates
    latitude: { type: String, trim: true, default: null },
    longitude: { type: String, trim: true, default: null },

    // primary timezone
    timezone: { type: String, trim: true, default: null },

    // status flag (active/inactive for filtering)
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },

    // extra metadata or attributes
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    versionKey: false,
    collection: "states",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Indexes for faster lookups
StateSchema.index({ country_code: 1, name: 1 });
StateSchema.index({ iso3166_2: 1 });
StateSchema.index({ id: 1 });

// Plugin: aggregate pagination support
StateSchema.plugin(mongooseAggregatePaginate);

const State = model("states", StateSchema);
export default State;
