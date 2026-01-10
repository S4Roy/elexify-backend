import mongoose from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const { Schema, model, Types } = mongoose;

const UserSchema = new Schema(
  {
    role: {
      type: String,
      required: true,
      enum: [
        "superadmin",
        "manager",
        "supervisor",
        "staff",
        "customer",
        "vendor",
        "operator",
        "user",
      ],
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    mobile: {
      type: String,
      required: false,
      default: null,
      // unique: true,
    },
    address: {
      type: String,
      required: false,
    },
    password: {
      type: String,
      required: true,
    },
    profile_image: {
      type: String,
      required: false,
      default: null,
    },
    reset_token: {
      type: String,
      required: false,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive"],
      default: "active",
    },
    email_verified_at: {
      type: Date,
      default: null,
    },
    mobile_verified_at: {
      type: Date,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    created_by: {
      type: Types.ObjectId,
      default: null,
    },
    updated_at: {
      type: Date,
      default: null,
    },
    updated_by: {
      type: Types.ObjectId,
      default: null,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
    deleted_by: {
      type: Types.ObjectId,
      default: null,
    },
    seller_details: {
      type: Types.ObjectId,
      ref: "seller_details",
      default: null,
    },
  },
  { versionKey: false }
);

// Apply Mongoose pagination plugin
UserSchema.plugin(mongooseAggregatePaginate);

// Create model
const User = model("users", UserSchema);

export default User;
