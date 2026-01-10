// src/controllers/cronjobs/exchangeRate.js
import ExchangeRate from "../../models/ExchangeRate.js";
import Currency from "../../models/Currency.js";
import axios from "axios";

// Core logic (reusable)
export const fetchAndUpdateExchangeRate = async () => {
  const { data } = await axios.get("https://open.er-api.com/v6/latest/INR");

  if (!data || !data.rates) {
    throw new Error("Invalid response from exchange rate provider");
  }
  await ExchangeRate.findOneAndUpdate(
    {},
    {
      base: data.base_code,
      rates: data.rates,
      updated_at: new Date(),
    },
    { upsert: true, new: true }
  );
  // Update each Currency document’s 'rates' field if code matches
  const codes = Object.keys(data.rates);

  // Bulk update currencies that exist in your Currency collection
  for (const code of codes) {
    const rate = data.rates[code];
    // Update only if currency exists
    await Currency.findOneAndUpdate(
      { code: code.toUpperCase() },
      { rates: rate, updated_at: new Date() },
      { new: true }
    );
  }
  return data;
};

// Express handler
export const exchangeRate = async (req, res, next) => {
  try {
    const data = await fetchAndUpdateExchangeRate();

    res.status(200).json({
      status: "success",
      message:
        req.__?.("Rates fetched successfully") ?? "Rates fetched successfully",
      data,
    });
  } catch (error) {
    console.log(error);

    next(error);
  }
};
