// services/shiprocket-serviceability.js
import axios from "axios";
import { getTokens } from "./getTokens.js";
import { invalidateToken } from "./invalidateToken.js";

const SERVICEABILITY_URL =
  "https://apiv2.shiprocket.in/v1/external/courier/serviceability/";

/** volumetric weight (cm) -> kg using /5000 rule */
const volumetricWeightKg = (l = 0, w = 0, h = 0) => {
  const vol = (Number(l) || 0) * (Number(w) || 0) * (Number(h) || 0);
  if (!vol) return 0;
  return vol / 5000.0;
};

/** Normalizes Shiprocket response into predictable fields */
const normalizeCarriers = (raw) => {
  let carriers =
    raw?.data?.available_courier_companies ||
    raw?.data?.available_couriers ||
    raw?.data?.couriers ||
    raw?.available_couriers ||
    raw?.couriers ||
    raw?.data ||
    raw;

  if (!carriers) return [];

  if (!Array.isArray(carriers) && typeof carriers === "object") {
    // try to find an array inside the object
    const arr = Object.values(carriers).find((v) => Array.isArray(v));
    if (arr) carriers = arr;
    else carriers = [carriers];
  }

  return carriers
    .map((c) => {
      const courierName =
        c.courier_name || c.name || c.courier || c.title || null;
      const courierId = c.courier_company_id || c.courier_id || c.id || c.courier_code || null;
      const shippingCost =
        (c.charges &&
          (c.charges.total_charge || c.charges.total || c.charges.shipping)) ||
        c.total_charge ||
        c.total ||
        c.rate ||
        c.shipping_charges ||
        c.cost ||
        null;
      const gst = c.gst_charge || c.gst || 0;
      const eta =
        c.estimated_delivery_days || c.delivery_time || c.estimated_delivery || c.sla || c.eta || null;
      const service =
        c.service_type || c.service || c.product_name || c.product || null;
      const rateNum = shippingCost != null ? Number(shippingCost) : null;
      const totalCharge = rateNum != null ? rateNum + (Number(gst) || 0) : null;

      return {
        raw: c,
        courier_name: courierName,
        courier_id: courierId,
        service,
        rate: rateNum,
        gst: Number(gst) || 0,
        total_charge: totalCharge,
        eta,
      };
    })
    .filter(
      (x) => x && x.total_charge != null && !Number.isNaN(x.total_charge)
    );
};

/**
 * serviceability(params)
 * params: {
 *   pickup_pincode: string|number (required),
 *   delivery_pincode: string|number (required),
 *   weight_kg: number (optional, default 0.5),
 *   cod: 0|1 (optional, default 0),
 *   length_cm, width_cm, height_cm (optional),
 *   declared_value (optional)
 * }
 */
export const serviceability = async (params = {}) => {
  const {
    pickup_pincode,
    delivery_pincode,
    weight_kg = 0.5,
    cod = 0,
    length_cm = 0,
    width_cm = 0,
    height_cm = 0,
    declared_value,
    timeout_ms = 15000,
  } = params;

  if (!pickup_pincode || !delivery_pincode) {
    return {
      success: false,
      error: "pickup_pincode and delivery_pincode are required",
    };
  }

  // compute effective weight (actual vs volumetric)
  const volKg = volumetricWeightKg(length_cm, width_cm, height_cm);
  const actual = Number(weight_kg) || 0.001;
  const weightToUse = Math.max(actual, volKg || 0.001);

  // Build query string (Shiprocket expects weight in kg; cod 1 or 0)
  const qs = new URLSearchParams({
    pickup_postcode: String(pickup_pincode),
    delivery_postcode: String(delivery_pincode),
    weight: String(Number(weightToUse.toFixed(3))),
    cod: String(Number(cod) ? 1 : 0),
  });
  if (declared_value) qs.set("declared_value", String(declared_value));

  // internal helper for the actual API call
  const callApi = async (token) => {
    const url = `${SERVICEABILITY_URL}?${qs.toString()}`;
    const resp = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: timeout_ms,
    });
    return resp.data;
  };

  try {
    let token = await getTokens();
    let rawResp;
    try {
      rawResp = await callApi(token);
    } catch (err) {
      const status = err?.response?.status;
      // try once on auth error: invalidate persisted token if you have a Token model entry
      if (status === 401 || status === 403) {
        await invalidateToken().catch(() => {});

        // re-obtain token and retry
        token = await getTokens();
        rawResp = await callApi(token);
      } else {
        const body = err.response?.data || err.message;
        return { success: false, error: body };
      }
    }

    const couriers = normalizeCarriers(rawResp);
    const cheapest = couriers.length
      ? couriers
          .slice()
          .sort(
            (a, b) => (a.total_charge ?? a.rate) - (b.total_charge ?? b.rate)
          )[0]
      : null;

    return {
      success: true,
      pickup_pincode: String(pickup_pincode),
      delivery_pincode: String(delivery_pincode),
      weight_kg: Number(weightToUse.toFixed(3)),
      couriers,
      cheapest,
      raw: rawResp,
    };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message || err };
  }
};
