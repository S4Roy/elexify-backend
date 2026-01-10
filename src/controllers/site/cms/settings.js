import SiteSetting from "../../../models/SiteSetting.js";
import ExchangeRate from "../../../models/ExchangeRate.js";

/**
 * List Site Settings (with optional consultation_fee currency conversion)
 */
export const settings = async (req, res, next) => {
  try {
    let data = null;
    const { type, currency } = req.query;

    if (type === "consultation_fee") {
      // use lean() so we get plain JS objects we can map safely
      const settings = await SiteSetting.find({ type })
        .sort({ type: -1 })
        .lean()
        .exec();

      // latest exchange rates (assumes a document with a "rates" map/object and optional "base" field)
      const ratesDoc = await ExchangeRate.findOne()
        .sort({ updated_at: -1 })
        .lean()
        .exec();
      const rates = ratesDoc?.rates ?? {};
      let exchangeRate = 1;

      if (currency && currency !== (ratesDoc?.base || "INR")) {
        // support both Map-like and plain object storage
        if (typeof rates.get === "function") {
          exchangeRate = rates.get(currency) ?? 1;
        } else {
          exchangeRate = rates[currency] ?? 1;
        }
      }

      // map and return converted values (keep original objects intact by returning new objects)
      data = settings.map((item) => {
        const numericValue = Number(item.value ?? 0);
        const converted = numericValue * Number(exchangeRate ?? 1);
        // round to 2 decimals (optional) — change or remove to suit your needs
        const rounded = Math.round(converted * 100) / 100;
        return { ...item, value: rounded };
      });
    } else {
      data = await SiteSetting.find().sort({ type: -1 }).lean().exec();
    }

    return res.status(200).json({
      status: "success",
      message: req.__(`Data fetched successfully`),
      data,
    });
  } catch (error) {
    return next(error);
  }
};
