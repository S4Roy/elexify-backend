import { orderService } from "../../../../services/index.js";

// "Fetch Shiprocket details" button on Order Details — always available,
// for an order in any status. Read-only: never writes to the database,
// it only looks up and returns what Shiprocket currently reports (an
// existing link is looked up directly; an order with nothing linked yet
// is searched live by its own order id). See
// services/orderService/fetchShiprocketDetails.js.
export const syncShiprocketStatus = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    const result = await orderService.fetchShiprocketDetailsForOrder({ orderId: order_id });
    return res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};
