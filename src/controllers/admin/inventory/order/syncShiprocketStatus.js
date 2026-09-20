import { orderService } from "../../../../services/index.js";

// "Fetch Shiprocket details" button on Order Details — always available,
// for an order in any status. An order already linked locally is only
// ever looked up and shown, never written to; an order with nothing
// linked yet gets searched live by its own order id and, on a single
// unambiguous match, linked via the same verified flow every other
// manual-link path uses. See services/orderService/fetchShiprocketDetails.js.
export const syncShiprocketStatus = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const result = await orderService.fetchShiprocketDetailsForOrder({
      orderId: order_id,
      adminId: req.auth.user_id,
    });
    return res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};
