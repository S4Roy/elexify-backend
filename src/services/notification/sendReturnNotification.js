import Order from "../../models/Order.js";
import { sendOrderNotification } from "./sendOrderNotification.js";

export const sendReturnNotification = async ({ request, event }) => {
  const order = await Order.findById(request.order_id);
  if (!order) return;
  sendOrderNotification({
    order,
    event,
    data: {
      return_request_number: request.request_number,
      return_status: request.status,
      return_reason: request.reason,
      refund_amount: request.refund?.amount || 0,
      review_note: request.review_note || null,
    },
    dedupeKey: `${request.request_number}:${event}`,
  });
};
