import { orderService } from "../../../../services/index.js";

// Sync each linked shipment; preserve verified discovery for unlinked orders.
export const syncShiprocketStatus = async (req, res, next) => {
  try {
    const { order_id, channel_id, package_ids } = req.body;
    const result = await orderService.fetchShiprocketDetailsForOrder({
      orderId: order_id,
      adminId: req.auth.user_id,
      channelId: channel_id || undefined,
      packageIds: package_ids,
    });
    return res.status(200).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
};
