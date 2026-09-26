import Subscriber from "../../../models/Subscriber.js";

// Idempotent: repeat requests do not change subscription status or metadata.
// Keep the response identical so this public endpoint does not disclose membership.
export const submit = async (req, res, next) => {
  try {
    const email = req.body.email.trim().toLowerCase();
    try {
      await Subscriber.updateOne(
        { email },
        { $setOnInsert: {
          email,
          source: "web",
          ip: req.ip || null,
          user_agent: req.get("User-Agent") || null,
          created_by: req.auth?.user_id ?? null,
          created_at: new Date(),
          updated_at: new Date(),
        } },
        { upsert: true, runValidators: true, timestamps: false },
      );
    } catch (error) {
      // Concurrent upserts can race against the unique email index.
      if (error.code !== 11000 || !error.keyPattern?.email) throw error;
    }
    res.status(200).json({
      status: "success",
      message: req.__("Subscribed successfully"),
      data: {},
    });
  } catch (error) {
    next(error);
  }
};
