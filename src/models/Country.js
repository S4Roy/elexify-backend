import mongoose from "mongoose";
const { Schema, model } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

/**
 * Country schema (industry-oriented)
 * - Uses ISO fields (iso2, iso3, numeric_code)
 * - Keeps legacy `rates` field (if you store exchange rate or other numeric value)
 * - Uses timestamps with created_at / updated_at names to match your original naming
 * - Adds useful indexes and uniqueness constraints
 */

const timezoneSchema = new Schema(
  {
    zoneName: { type: String },
    gmtOffset: { type: Number }, // seconds
    gmtOffsetName: { type: String },
    abbreviation: { type: String },
    tzName: { type: String },
  },
  { _id: false }
);

const translationsSchema = new Schema(
  {
    en: { type: String },
    fr: { type: String },
    es: { type: String },
    de: { type: String },
    ja: { type: String },
    zh: { type: String },
    // add more keys as needed
  },
  { _id: false }
);

const CountrySchema = new Schema(
  {
    id: { type: Number, index: true },
    // ISO alpha-2 code (e.g., "IN")
    iso2: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 2,
      maxlength: 2,
      unique: true,
    },

    // ISO alpha-3 code (e.g., "IND")
    iso3: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      unique: true,
    },

    // Numeric ISO code as string (e.g., "356")
    numeric_code: { type: String, trim: true },

    // Human-friendly country name
    name: { type: String, required: true, trim: true, index: true },

    // Currency code (e.g., "INR", "USD") — optional if you want store currency per country
    currency: { type: String, uppercase: true, trim: true, maxlength: 3 },

    // currency symbol e.g. "₹"
    currency_symbol: { type: String, trim: true, default: null },

    // Phone calling code (E.164) without spaces, e.g. "+91"
    phone_code: { type: String, trim: true, default: null },

    // Top-level domain, e.g. ".in"
    tld: { type: String, trim: true, default: null },

    // Native/local name
    native: { type: String, trim: true, default: null },

    // Region & subregion (e.g., "Asia", "Southern Asia")
    region: { type: String, trim: true, default: null },
    subregion: { type: String, trim: true, default: null },

    // Coordinates (strings to preserve precision from source JSON)
    latitude: { type: String, trim: true, default: null },
    longitude: { type: String, trim: true, default: null },

    // Timezones (array)
    timezones: { type: [timezoneSchema], default: [] },

    // Translations
    translations: { type: translationsSchema, default: {} },

    // Flag (emoji) or URL to SVG/PNG
    flag: { type: String, default: null },

    // A short "icon" field if you use a separate icon source
    icon: { type: String, default: null },

    // Optional numeric field (you had `rates` — keep if needed)
    rates: { type: Number, default: null },

    // Status for soft enabling/disabling countries
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },

    // Any extra freeform metadata
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    versionKey: false,
    collection: "countries",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Indexes: iso2 and iso3 are unique; name search index
CountrySchema.index({ iso2: 1 });
CountrySchema.index({ iso3: 1 });
CountrySchema.index({ name: "text" });

// If you still want a pre-save hook for some custom logic, keep it. But timestamps auto-updates updated_at.
CountrySchema.pre("save", function (next) {
  // example: ensure iso2/iso3 uppercasing regardless of input
  if (this.iso2) this.iso2 = this.iso2.toUpperCase();
  if (this.iso3) this.iso3 = this.iso3.toUpperCase();
  next();
});

CountrySchema.plugin(mongooseAggregatePaginate);

const Country = model("countries", CountrySchema);
export default Country;
