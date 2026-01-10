import Consultation from "../../../models/Consultation.js";
import SiteSetting from "../../../models/SiteSetting.js";
import { StatusError } from "../../../config/index.js";
import ExchangeRate from "../../../models/ExchangeRate.js"; // ✅
import { paymentService } from "../../../services/index.js";
/**
 * Add Consultation (allow guest)
 * @param req
 * @param res
 * @param next
 */
export const submit = async (req, res, next) => {
  try {
    const {
      type,
      name,
      phone,
      email,
      gender,
      dob,
      time,
      place,
      occupation,
      purpose,
      currency = "INR",
      postcode,
      current_address,
    } = req.body;
    // Get consultation_fee
    let consultation_fee = 1500;
    let consultation_type = null;
    switch (type) {
      case "Rudraksha":
        consultation_type = "rudraksha_consultation_fee";
        break;
      case "Astro":
        consultation_type = "astro_consultation_fee";
        break;

      default:
        consultation_type = null;
        break;
    }
    const consultation_fee_type = await SiteSetting.findOne({
      slug: consultation_type,
    });
    if (consultation_fee_type?.value && !isNaN(consultation_fee_type.value)) {
      consultation_fee = Number(consultation_fee_type.value);
    }
    const user_id = req.auth?.user_id || null; // allow guest (null)
    // ✅ Get latest exchange rate
    const ratesDoc = await ExchangeRate.findOne().sort({ updated_at: -1 });
    const exchangeRate = ratesDoc?.rates?.get(currency) ?? 1;
    const sub_total = consultation_type ? consultation_fee * exchangeRate : 0; // Paid consultation is 1000 INR
    // Optional: check for duplicate only if user_id exists
    if (user_id) {
      const existing = await Consultation.findOne({
        user: user_id,
        phone,
        dob,
        deleted_at: null,
        status: { $in: ["pending", "confirmed"] },
      });

      if (existing) {
        throw StatusError.badRequest(
          "You already have an active consultation request"
        );
      }
    }

    const consultation = new Consultation({
      type,
      name,
      phone,
      email: email || null,
      gender,
      dob,
      time,
      place,
      occupation,
      purpose,
      postcode,
      current_address,
      created_by: user_id,
      created_at: Date.now(),
    });

    await consultation.save();
    let razorpay = null;
    if (consultation_type) {
      const razorpayOrder = await paymentService.createRazorpayOrder(
        sub_total,
        currency,
        consultation?._id
      );
      await Consultation.findOneAndUpdate(
        { _id: consultation?._id },
        {
          payment: {
            payment_provider: "razorpay",
            razorpay_order_id: razorpayOrder.id,
            razorpay_payment_id: null,
            amount: sub_total,
            razorpay_signature: null,
            status: "pending",
          },
        }
      );

      razorpay = razorpayOrder;
    }
    res.status(201).json({
      status: "success",
      message: req.__("Consultation request submitted successfully"),
      data: { consultation, razorpay },
    });
  } catch (error) {
    next(error);
  }
};
