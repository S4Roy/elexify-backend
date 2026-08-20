import mongoose from "../config/mongoose.js";
import User from "../models/User.js";

const run = async () => {
  const users = mongoose.connection.collection("users");

  const existing = await users.indexes();
  const names = existing.map((i) => i.name);

  if (names.includes("email_1")) {
    await users.dropIndex("email_1");
    console.log("Dropped email_1");
  }
  if (names.includes("phone_code_1_mobile_1")) {
    await users.dropIndex("phone_code_1_mobile_1");
    console.log("Dropped phone_code_1_mobile_1");
  }

  await User.syncIndexes();
  console.log("Synced new partial indexes");

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
