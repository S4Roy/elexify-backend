import mongoose from "../config/mongoose.js";
import User from "../models/User.js";

const run = async () => {
  // wait for the connection to actually be open before querying
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once("open", resolve);
      mongoose.connection.once("error", reject);
    });
  }

  console.log("=== Duplicate phone_code + mobile ===");
  const mobileDupes = await User.aggregate([
    {
      $match: { mobile: { $type: "string" }, phone_code: { $type: "string" } },
    },
    {
      $group: {
        _id: { phone_code: "$phone_code", mobile: "$mobile" },
        count: { $sum: 1 },
        docs: {
          $push: {
            _id: "$_id",
            name: "$name",
            status: "$status",
            deleted_at: "$deleted_at",
            created_at: "$created_at",
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
  console.log(JSON.stringify(mobileDupes, null, 2));

  console.log("=== Duplicate email ===");
  const emailDupes = await User.aggregate([
    { $match: { email: { $type: "string" } } },
    {
      $group: {
        _id: "$email",
        count: { $sum: 1 },
        docs: {
          $push: {
            _id: "$_id",
            name: "$name",
            status: "$status",
            deleted_at: "$deleted_at",
            created_at: "$created_at",
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
  console.log(JSON.stringify(emailDupes, null, 2));

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
