import moment from "moment-timezone";
import Token from "../../models/Token.js";

export const invalidateToken = async () => {
  try {
    await Token.updateOne(
      { provider: "shiprocket" },
      {
        $set: {
          access_token: null,
          expires_at: moment()
            .subtract(1, "minute")
            .tz("Asia/Kolkata")
            .toDate(),
        },
      }
    );
  } catch (e) {
    // ignore
  }
};
