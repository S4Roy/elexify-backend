import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const ConsultationSchema = new Schema(
  {
    custom_id: { type: String, unique: true, index: true },

    // Consultation type (Rudraksha, Astro, Free, Paid — adjust as needed)
    type: {
      type: String,
      enum: ["Rudraksha", "Astro", "Free", "Paid"],
      required: true,
      default: "Rudraksha",
    },

    // Applicant details
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (v) => {
          if (!v) return true;
          // simple email check
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: (props) => `${props.value} is not a valid email`,
      },
    },
    gender: { type: String, enum: ["male", "female", "other"], required: true },

    // Birth details
    dob: { type: Date, required: true }, // Date of birth
    time: {
      type: String,
      required: false,
      trim: true,
      validate: {
        validator: (v) => {
          if (!v) return true;
          // allow HH:mm or HH:mm:ss
          return /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(v);
        },
        message: (props) => `${props.value} is not a valid time (HH:mm)`,
      },
    },
    place: { type: String, required: true, trim: true }, // Birth place
    postcode: { type: String, required: false, trim: true },
    current_address: { type: String, required: false, trim: true },

    // Purpose / Problem statement
    purpose: { type: String, required: true, trim: true, maxlength: 2000 },
    occupation: { type: String, required: false, trim: true, maxlength: 2000 },

    // Status of consultation
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled"],
      default: "pending",
    },

    // If paid
    payment: {
      razorpay_order_id: { type: String, default: null, trim: true },
      razorpay_payment_id: { type: String, default: null, trim: true },
      amount: { type: Number, default: 0 },
      currency: { type: String, default: "INR" },
      status: {
        type: String,
        enum: ["pending", "success", "failed"],
        default: "pending",
      },
      paid_at: { type: Date, default: null },
    },

    // Admin assigned astrologer (user id)
    astrologer: {
      type: Types.ObjectId,
      ref: "users",
      default: null,
      index: true,
    },

    // Response / notes
    notes: [
      {
        added_by: { type: Types.ObjectId, ref: "users", default: null },
        content: { type: String, trim: true },
        created_at: { type: Date, default: Date.now },
      },
    ],

    // Soft delete
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Types.ObjectId, ref: "users", default: null },
  },
  {
    versionKey: false,
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Indexes
ConsultationSchema.index({ phone: 1, email: 1 });
ConsultationSchema.index({ type: 1, status: 1 });
ConsultationSchema.index({ astrologer: 1, status: 1 });
ConsultationSchema.index({ createdAt: -1 });

// Generate custom_id before validation (so it exists for unique checks)
ConsultationSchema.pre("validate", async function (next) {
  if (this.custom_id) return next();

  try {
    // Generate YYYYMMDD in server (UTC) — change to local if needed
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const datePart = `${yyyy}${mm}${dd}`; // YYYYMMDD

    // Count documents created today (UTC)
    const start = new Date(
      Date.UTC(yyyy, now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
    );
    const end = new Date(
      Date.UTC(yyyy, now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
    );

    const count = await this.constructor.countDocuments({
      createdAt: { $gte: start, $lte: end },
    });

    this.custom_id = `CONSULT-${datePart}-${String(count + 1).padStart(
      4,
      "0"
    )}`;
    next();
  } catch (err) {
    next(err);
  }
});

// Plugin for aggregate pagination
ConsultationSchema.plugin(mongooseAggregatePaginate);

const Consultation = model("consultations", ConsultationSchema);
export default Consultation;
