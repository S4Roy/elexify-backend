import WebhookLog from "../../../models/WebhookLog.js";
import Order from "../../../models/Order.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";

// Powers the admin "Webhook Logs" audit view — every inbound provider
// webhook call as received (see src/models/WebhookLog.js), independent of
// whether it changed anything. Filterable by provider/outcome/date and by
// order id, AWB, or Shiprocket's own order id so an admin can pull up
// everything received for one shipment while investigating an issue.

const OBJECT_ID = /^[a-f0-9]{24}$/i;

// WebhookLog.order_id is loose: Shiprocket rows carry the order number
// ("ORD-000152"), Razorpay rows the order's _id. Resolve both to
// { _id, id } so the admin can link every row to the order-details page.
const attachOrders = async (docs = []) => {
  const refs = [...new Set(docs.map((d) => d.order_id).filter(Boolean))];
  if (!refs.length) return docs;
  const orders = await Order.find({
    $or: [{ _id: { $in: refs.filter((r) => OBJECT_ID.test(r)) } }, { id: { $in: refs } }],
  }).select("_id id").lean();
  const byRef = new Map();
  for (const o of orders) {
    byRef.set(String(o._id), o);
    byRef.set(o.id, o);
  }
  return docs.map((d) => {
    const o = byRef.get(d.order_id);
    return { ...d, order: o ? { _id: o._id, id: o.id } : null };
  });
};

export const list = async (req, res, next) => {
  try {
    const {
      provider = null,
      outcome = null,
      search = null,
      from = null,
      to = null,
      page = 1,
      limit = envs.pagination.limit,
    } = req.query;

    const match = {};
    if (provider) match.provider = provider;
    if (outcome) match.outcome = outcome;
    if (search) {
      const term = String(search).trim();
      if (term) {
        // An order number also finds Razorpay rows, which store the _id.
        const order = /^#?ord-?\d+$/i.test(term)
          ? await Order.findOne({ id: term.replace(/^#/, "").toUpperCase() }).select("_id").lean()
          : null;
        match.$or = [
          { order_id: term },
          ...(order ? [{ order_id: String(order._id) }] : []),
          { awb: term },
          { shiprocket_order_id: term },
          ...["event_id", "provider_order_id", "payment_id", "refund_id"].map(field => ({ [field]: term })),
        ];
      }
    }
    if (from || to) {
      match.received_at = {};
      if (from) match.received_at.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        match.received_at.$lte = end;
      }
    }

    const pipeline = [
      { $match: match },
      { $sort: { received_at: -1 } },
      {
        $project: {
          provider: 1,
          event_type: 1,
          event_id: 1,
          provider_order_id: 1,
          payment_id: 1,
          refund_id: 1,
          signature_verified: 1,
          duplicate: 1,
          processing_state: 1,
          attempts: 1,
          next_retry_at: 1,
          order_id: 1,
          package_id: 1,
          shiprocket_order_id: 1,
          awb: 1,
          incoming_status: 1,
          mapped_status: 1,
          outcome: 1,
          outcome_detail: 1,
          status_code: 1,
          processing_ms: 1,
          received_at: 1,
          // Full payload is left out of the list projection — it's fetched
          // only for one entry at a time via `details` below, since it can
          // carry a full scans array and isn't needed to render a row.
        },
      },
    ];

    const data = await WebhookLog.aggregatePaginate(WebhookLog.aggregate(pipeline), {
      page,
      limit,
    });
    data.docs = await attachOrders(data.docs);

    res.status(200).json({
      status: "success",
      message: req.__("Webhook logs fetched successfully"),
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const details = async (req, res, next) => {
  try {
    const entry = await WebhookLog.findById(req.params.id).lean();
    if (!entry) throw StatusError.notFound("Webhook log entry not found");
    res.status(200).json({
      status: "success",
      message: req.__("Webhook log details fetched successfully"),
      data: entry,
    });
  } catch (error) {
    next(error);
  }
};
