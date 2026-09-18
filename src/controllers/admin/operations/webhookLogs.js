import WebhookLog from "../../../models/WebhookLog.js";
import { StatusError } from "../../../config/index.js";
import { envs } from "../../../config/index.js";

// Powers the admin "Webhook Logs" audit view — every inbound provider
// webhook call as received (see src/models/WebhookLog.js), independent of
// whether it changed anything. Filterable by provider/outcome/date and by
// order id, AWB, or Shiprocket's own order id so an admin can pull up
// everything received for one shipment while investigating an issue.
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
        match.$or = [
          { order_id: term },
          { awb: term },
          { shiprocket_order_id: term },
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
