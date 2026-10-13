import { resolveEmailBrand } from '../../services/email/resolveEmailBrand.js';
import { Router } from "express";
import { celebrate, Joi } from "celebrate";
import rateLimit from "express-rate-limit";
import { randomBytes, createHash } from "node:crypto";
import Campaign from "../../models/EmailCampaign.js";
import Recipient from "../../models/EmailCampaignRecipient.js";
import Subscriber from "../../models/Subscriber.js";
import { StatusError } from "../../config/StatusErrors.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import {
  cleanBody,
  renderCampaign,
  audienceFilter,
} from "../../services/campaigns/content.js";
import {
  deliverCampaign,
  campaignPreflight,
} from "../../services/campaigns/delivery.js";
import { ensureCampaignIndexes } from "../../services/campaigns/worker.js";
const router = Router();
const id = Joi.string().hex().length(24).required();
const params = { params: Joi.object({ id }) };
const guard = (action) =>
  requirePermission("subscribers.view", `customer.notification.${action}`);
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const ok = (res, data) => res.json({ status: "success", data });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fields = {
  name: Joi.string().trim().max(120).required(),
  subject: Joi.string()
    .trim()
    .max(200)
    .pattern(/^[^\r\n]+$/)
    .required(),
  preheader: Joi.string().trim().max(200).allow("").default(""),
  body: Joi.string().max(50000).required(),
  source: Joi.string()
    .valid("all", "web", "mobile", "api", "widget", "other")
    .default("all"),
};
const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
};
const limiter = rateLimit({
  windowMs: 60000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
async function get(req) {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) throw StatusError.notFound("Campaign not found.");
  return campaign;
}
function content(body) {
  const data = { ...body, body: cleanBody(body.body) };
  if (!data.body.trim())
    throw StatusError.badRequest("Campaign content must not be empty.");
  return data;
}
router.get(
  "/",
  guard("view"),
  celebrate({ query: Joi.object(pagination) }),
  wrap(async (req, res) => {
    const { page, limit } = req.query;
    const [docs, totalDocs] = await Promise.all([
      Campaign.find()
        .select(
          "-lock_token -lock_until -confirmation_actor -confirmation_expires",
        )
        .sort({ created_at: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Campaign.countDocuments(),
    ]);
    ok(res, {
      docs,
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
    });
  }),
);
router.post(
  "/",
  guard("create"),
  celebrate({ body: Joi.object(fields) }),
  wrap(async (req, res) => {
    ok(
      res,
      await Campaign.create({
        ...content(req.body),
        created_by: req.auth.user_id,
        updated_by: req.auth.user_id,
      }),
    );
  }),
);
router.put(
  "/:id",
  guard("create"),
  celebrate({
    ...params,
    body: Joi.object({
      ...fields,
      revision: Joi.number().integer().min(1).required(),
    }),
  }),
  wrap(async (req, res) => {
    const { revision, ...body } = req.body;
    const updated = await Campaign.findOneAndUpdate(
      { _id: req.params.id, status: "draft", revision },
      {
        $set: { ...content(body), updated_by: req.auth.user_id },
        $inc: { revision: 1 },
        $unset: {
          confirmation_hash: "",
          confirmation_expires: "",
          confirmation_actor: "",
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated)
      throw StatusError.conflict(
        "Draft changed or has already been queued. Refresh before editing.",
      );
    ok(res, updated);
  }),
);
router.get(
  "/:id",
  guard("view"),
  celebrate(params),
  wrap(async (req, res) => {
    const campaign = await get(req);
    const groups = await Recipient.aggregate([
      { $match: { campaign_id: campaign._id } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    ok(res, {
      campaign,
      stats: Object.fromEntries(
        groups.map((group) => [group._id, group.count]),
      ),
    });
  }),
);
router.get(
  "/:id/recipients",
  guard("view"),
  celebrate({ ...params, query: Joi.object(pagination) }),
  wrap(async (req, res) => {
    const campaign = await get(req);
    const filter = { campaign_id: campaign._id };
    const { page, limit } = req.query;
    const [docs, totalDocs] = await Promise.all([
      Recipient.find(filter)
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Recipient.countDocuments(filter),
    ]);
    ok(res, {
      docs,
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
    });
  }),
);
router.get(
  "/:id/preview",
  guard("view"),
  celebrate(params),
  wrap(async (req, res) => {
    const campaign = await get(req);
    ok(res, {
      ...renderCampaign(campaign),
      audience_count: await Subscriber.countDocuments(audienceFilter(campaign)),
    });
  }),
);
router.post(
  "/:id/test",
  guard("create"),
  limiter,
  celebrate({
    ...params,
    body: Joi.object({ email: Joi.string().email().max(254).required() }),
  }),
  wrap(async (req, res) => {
    const campaign = await get(req);
    await deliverCampaign(campaign, req.body.email, "", true);
    ok(res, { message: "Test email accepted by the mail server." });
  }),
);
router.post(
  "/:id/prepare",
  guard("send"),
  celebrate(params),
  wrap(async (req, res) => {
    const campaign = await get(req);
    if (campaign.status !== "draft")
      throw StatusError.conflict("Only drafts can be queued.");
    await campaignPreflight();
    await ensureCampaignIndexes();
    const count = await Subscriber.countDocuments(audienceFilter(campaign));
    if (!count)
      throw StatusError.badRequest(
        "There are no eligible subscribed contacts.",
      );
    const token = randomBytes(32).toString("hex");
    const updated = await Campaign.findOneAndUpdate(
      { _id: campaign._id, status: "draft", revision: campaign.revision },
      {
        $set: {
          confirmation_hash: hash(token),
          confirmation_actor: req.auth.user_id,
          confirmation_expires: new Date(Date.now() + 10 * 60000),
          audience_count: count,
        },
      },
    );
    if (!updated)
      throw StatusError.conflict("Draft changed. Preview it again.");
    ok(res, { token, audience_count: count, revision: campaign.revision });
  }),
);
router.post(
  "/:id/queue",
  guard("send"),
  celebrate({
    ...params,
    body: Joi.object({
      token: Joi.string().hex().length(64).required(),
      revision: Joi.number().integer().min(1).required(),
      scheduled_at: Joi.date().iso().min("now").optional(),
    }),
  }),
  wrap(async (req, res) => {
    if (req.body.scheduled_at)
      await new Promise((resolve, reject) =>
        requirePermission("customer.notification.schedule")(
          req,
          res,
          (error) => (error ? reject(error) : resolve()),
        ),
      );
    await campaignPreflight();
    const updated = await Campaign.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "draft",
        revision: req.body.revision,
        confirmation_hash: hash(req.body.token),
        confirmation_actor: req.auth.user_id,
        confirmation_expires: { $gt: new Date() },
      },
      {
        $set: {
          status: "queued",
          scheduled_at: req.body.scheduled_at || new Date(),
          audience_cutoff: new Date(),
          queued_by: req.auth.user_id,
        },
        $unset: {
          confirmation_hash: "",
          confirmation_actor: "",
          confirmation_expires: "",
        },
      },
      { new: true },
    );
    if (!updated)
      throw StatusError.conflict(
        "Confirmation expired, draft changed, or campaign already queued. Preview again.",
      );
    ok(res, updated);
  }),
);
router.post(
  "/:id/cancel",
  guard("cancel"),
  celebrate(params),
  wrap(async (req, res) => {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["queued", "sending"] } },
      { $set: { status: "cancelled", updated_by: req.auth.user_id } },
      { new: true },
    );
    if (!campaign)
      throw StatusError.conflict(
        "Only queued or sending campaigns can be cancelled.",
      );
    await Recipient.updateMany(
      { campaign_id: campaign._id, status: "pending" },
      { $set: { status: "skipped", error: "Campaign cancelled." } },
    );
    ok(res, campaign);
  }),
);
export { router as emailCampaignsRouter };
