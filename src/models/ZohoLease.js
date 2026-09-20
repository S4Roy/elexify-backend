import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  owner: { type: String, required: true },
  until: { type: Date, required: true },
});
export default mongoose.model("zoho_leases", schema);
