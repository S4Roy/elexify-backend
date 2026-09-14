import Order from "../../models/Order.js";
import { sendOrderNotification } from "./sendOrderNotification.js";

export const sendReturnNotification = async ({ request, event }) => {
  try {
  const order = await Order.findById(request.order_id);
  if (!order) return;
  sendOrderNotification({
    order,
    event,
    data: {
      return_request_number: request.request_number,
      return_status: request.timeline?.at(-1)?.label || "Return Updated",
      return_reason: request.reason,
      refund_amount: request.refund?.amount || 0,
      review_note: request.review_note || null,
    },
    dedupeKey: `${request.request_number}:${event}${event === "RETURN_UPDATED" ? ":" + (request.timeline?.at(-1)?._id || request.status) : ""}`,
  });
  } catch (error) { console.error("Return notification enqueue failed:", error.message); }
};
