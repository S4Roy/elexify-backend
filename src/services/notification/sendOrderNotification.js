import { sendNotification } from "./sendNotification.js";
import { buildOrderEmailData } from "./buildOrderEmailData.js";

/**
 * Fire-and-forget wrapper around sendNotification() for order/payment/
 * refund events — builds the shared order-summary data (buildOrderEmailData)
 * and enqueues the notification, without ever being awaited by the caller.
 * Building the summary is itself async (one indexed OrderItem query), so
 * it's chained inside the same un-awaited promise rather than awaited
 * up front — a slow/failed data build or notification enqueue can never
 * delay or fail the HTTP response this is called from.
 */
export const sendOrderNotification = ({ order, event, data = {}, dedupeKey }) => {
  buildOrderEmailData(order)
    .then((orderEmailData) =>
      sendNotification({
        userId: order.user,
        event,
        data: {
          order_id: order.id,
          order_entity_id: String(order._id || ""),
          ...orderEmailData,
          ...(event === "PAYMENT_SUCCESS" ? {
            payment_amount: order.is_partial_cod ? order.advance_amount : order.grand_total,
          } : {}),
          ...data,
        },
        dedupeKey,
      })
    )
    .catch(() => {});
};
