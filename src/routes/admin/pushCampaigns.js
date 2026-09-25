import { Router } from "express";
import { celebrate, Joi } from "celebrate";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";
import { StatusError } from "../../config/StatusErrors.js";
import PushCampaign from "../../models/PushCampaign.js";
import NotificationPreference from "../../models/NotificationPreference.js";
import { validRoute } from "../../services/notification/push/templates.js";
import { pushConfig } from "../../services/notification/push/config.js";
import { persistPush } from "../../services/notification/push/service.js";
import {
  audiencePipeline,
  countAudience,
  createConfirmation,
  verifyConfirmation,
  campaignStats,
} from "../../services/notification/push/campaigns.js";
const router = Router();
const id = Joi.string().hex().length(24).required();
const params = { params: Joi.object({ id }) };
const limiter = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
const guard = (suffix) =>
  requirePermission(PERMISSIONS[`CUSTOMER_NOTIFICATION_${suffix}`]);
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};
const ok = (res, data) => res.json({ status: "success", data });
const get = async (req) => {
  const campaign = await PushCampaign.findOne({
    _id: req.params.id,
    environment: (await pushConfig()).environment,
  });
  if (!campaign) throw StatusError.notFound("Campaign not found.");
  return campaign;
};
router.get(
  "/",
  guard("VIEW"),
  celebrate({
    query: Joi.object({
      cursor: id.optional(),
      limit: Joi.number().integer().min(1).max(100).default(25),
    }),
  }),
  wrap(async (req, res) => {
    const limit = Number(req.query.limit || 25);
    const rows = await PushCampaign.find({
      environment: (await pushConfig()).environment,
      ...(req.query.cursor ? { _id: { $lt: req.query.cursor } } : {}),
    })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    ok(res, {
      items: rows.slice(0, limit),
      next_cursor: rows.length > limit ? String(rows[limit - 1]._id) : null,
    });
  })
);
router.post(
  "/",
  guard("CREATE"),
  celebrate({
    body: Joi.object({
      title: Joi.string().trim().min(1).max(100).required(),
      body: Joi.string().trim().min(1).max(500).required(),
      image_url: Joi.string()
        .uri({ scheme: ["https"] })
        .max(1000)
        .allow(""),
      route: Joi.string()
        .custom((v, helpers) =>
          validRoute(v) ? v : helpers.error("any.invalid")
        )
        .required(),
      audience: Joi.string().valid("all", "specific").required(),
      customer_ids: Joi.array()
        .items(id)
        .unique()
        .max(100)
        .when("audience", {
          is: "specific",
          then: Joi.array().min(1).required(),
          otherwise: Joi.forbidden(),
        }),
      expires_at: Joi.date()
        .greater("now")
        .custom((v, helpers) =>
          v.getTime() <= Date.now() + 90 * 86400000
            ? v
            : helpers.error("any.invalid")
        )
        .required(),
    }),
  }),
  wrap(async (req, res) => {
    const c = await pushConfig();
    if (!c.enabled)
      throw StatusError.badRequest(
        "Push is not configured for this environment."
      );
    const campaign = await PushCampaign.create({
      ...req.body,
      environment: c.environment,
      created_by: req.auth.user_id,
    });
    ok(res, { campaign });
  })
);
router.get(
  "/:id",
  guard("VIEW"),
  celebrate(params),
  wrap(async (req, res) => ok(res, { campaign: await get(req) }))
);
router.get(
  "/:id/analytics",
  guard("ANALYTICS"),
  celebrate(params),
  wrap(async (req, res) => {
    const campaign = await get(req);
    ok(res, { stats: await campaignStats(campaign._id) });
  })
);
router.post(
  "/:id/preview",
  guard("VIEW"),
  limiter,
  celebrate(params),
  wrap(async (req, res) => {
    const campaign = await get(req);
    const count = await countAudience(campaign);
    ok(res, {
      campaign,
      recipient_count: count,
      confirmation: createConfirmation(campaign._id, req.auth.user_id, count),
    });
  })
);
router.post(
  "/:id/test",
  guard("SEND"),
  limiter,
  celebrate({ ...params, body: Joi.object({ customer_id: id }) }),
  wrap(async (req, res) => {
    const campaign = await get(req);
    const rows = await NotificationPreference.aggregate(
      await audiencePipeline(
        {
          ...campaign.toObject(),
          audience: "specific",
          customer_ids: [req.body.customer_id],
        },
        { limit: 1 }
      )
    );
    if (!rows.length)
      throw StatusError.badRequest(
        "Test customer needs marketing consent and an active device in this environment."
      );
    const notification = await persistPush(
      rows[0].user_id,
      {
        type: "PROMOTIONAL_CAMPAIGN",
        category: "marketing",
        title: `[Test] ${campaign.title}`,
        body: campaign.body,
        image_url: campaign.image_url,
        route: campaign.route,
      },
      { dedupeKey: `test:${campaign._id}:${randomUUID()}` }
    );
    ok(res, { notification_id: notification?._id });
  })
);
for (const action of ["send", "schedule"])
  router.post(
    `/:id/${action}`,
    guard(action === "send" ? "SEND" : "SCHEDULE"),
    limiter,
    celebrate({
      ...params,
      body: Joi.object({
        confirmation: Joi.string().max(2000).required(),
        ...(action === "schedule"
          ? { scheduled_at: Joi.date().greater("now").required() }
          : {}),
      }),
    }),
    wrap(async (req, res) => {
      const campaign = await get(req);
      const confirmed = verifyConfirmation(
        req.body.confirmation,
        campaign._id,
        req.auth.user_id
      );
      if (!confirmed)
        throw StatusError.badRequest(
          "Preview the audience again before confirming."
        );
      if (campaign.status !== "DRAFT") {
        ok(res, { campaign });
        return;
      }
      if (!(await pushConfig()).enabled)
        throw StatusError.badRequest("Push is disabled.");
      const count = await countAudience(campaign);
      if (!count || count !== confirmed.count)
        throw StatusError.badRequest(
          "Audience changed or empty. Preview again."
        );
      const scheduled =
        action === "send" ? new Date() : new Date(req.body.scheduled_at);
      if (scheduled >= campaign.expires_at)
        throw StatusError.badRequest("Schedule must precede expiry.");
      const updated = await PushCampaign.findOneAndUpdate(
        { _id: campaign._id, status: "DRAFT" },
        {
          $set: {
            status: "SCHEDULED",
            scheduled_at: scheduled,
            audience_cutoff: new Date(),
            requested_recipients: count,
          },
        },
        { new: true }
      );
      ok(res, { campaign: updated || (await get(req)) });
    })
  );
router.post(
  "/:id/cancel",
  guard("CANCEL"),
  celebrate(params),
  wrap(async (req, res) => {
    const campaign = await get(req);
    const updated = await PushCampaign.findOneAndUpdate(
      {
        _id: campaign._id,
        status: { $in: ["DRAFT", "SCHEDULED", "PROCESSING"] },
      },
      {
        $set: {
          status: "CANCELLED",
          cancelled_by: req.auth.user_id,
          cancelled_at: new Date(),
        },
      },
      { new: true }
    );
    ok(res, { campaign: updated || campaign });
  })
);
export { router as pushCampaignsRouter };
