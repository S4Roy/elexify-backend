import { pendingRiderCash, receiveRiderCash, riderCashSummary } from "../../../../services/orderService/riderCash.js";

// Office side of rider COD cash: who is holding what, and recording a
// handover. See services/orderService/riderCash.js.
export const summary = async (req, res, next) => {
  try {
    res.status(200).json({ status: "success", data: await riderCashSummary() });
  } catch (error) {
    next(error);
  }
};

export const pending = async (req, res, next) => {
  try {
    const { rider_user_id, rider_name } = req.query;
    res.status(200).json({ status: "success", data: await pendingRiderCash({ riderUserId: rider_user_id, riderName: rider_name }) });
  } catch (error) {
    next(error);
  }
};

export const receive = async (req, res, next) => {
  try {
    const { rider_user_id, rider_name, order_ids, amount_received, note } = req.body;
    const handover = await receiveRiderCash({
      riderUserId: rider_user_id, riderName: rider_name, orderIds: order_ids,
      amountReceived: amount_received, note, adminId: req.auth.user_id,
    });
    res.status(201).json({ status: "success", data: handover });
  } catch (error) {
    next(error);
  }
};
