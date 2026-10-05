import { Router } from "express";
import { celebrate, Joi } from "celebrate";
import { requirePermission } from "../../middleware/requirePermission.js";
import { StatusError } from "../../config/StatusErrors.js";
import MobileUpdatePolicy from "../../models/MobileUpdatePolicy.js";
import { auditService } from "../../services/index.js";
import {
  ANDROID_STORE_URL,
  compareVersions,
  resolveUpdatePolicy,
  validStoreUrl,
} from "../../services/mobileUpdatePolicy.js";

const router = Router();
const platforms = ["android", "ios"];
const version = Joi.string().pattern(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/).messages({
  "string.pattern.base": "Use a version like 1.4.0",
});
const wrap = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (error) { next(error); }
};
const view = (platform, doc, live) => ({
  platform,
  enabled: doc?.enabled ?? false,
  latest_version: doc?.latest_version ?? live.latestVersion,
  minimum_version: doc?.minimum_version ?? live.minimumVersion,
  store_url: platform === "android" ? ANDROID_STORE_URL : doc?.store_url ?? live.storeUrl,
  title: doc?.title ?? "",
  message: doc?.message ?? "",
  remind_after_hours: doc?.remind_after_hours ?? 24,
  updated_at: doc?.updated_at ?? null,
  source: doc ? "admin" : "environment",
  live,
});

router.get("/", requirePermission("settings.view"), wrap(async (req, res) => {
  const docs = await MobileUpdatePolicy.find({ platform: { $in: platforms } }).lean();
  const data = await Promise.all(platforms.map(async platform =>
    view(platform, docs.find(d => d.platform === platform), await resolveUpdatePolicy(platform))));
  res.json({ status: "success", data });
}));

router.put("/:platform", requirePermission("settings.update"), celebrate({
  params: Joi.object({ platform: Joi.string().valid(...platforms).required() }),
  body: Joi.object({
    enabled: Joi.boolean().required(),
    latest_version: version.required(),
    minimum_version: version.required(),
    store_url: Joi.string().uri({ scheme: ["https"] }).allow("", null),
    title: Joi.string().trim().max(80).allow(""),
    message: Joi.string().trim().max(300).allow(""),
    remind_after_hours: Joi.number().integer().min(0).max(720).required(),
  }),
}), wrap(async (req, res) => {
  const { platform } = req.params;
  const body = req.body;
  if (compareVersions(body.minimum_version, body.latest_version) > 0)
    throw StatusError.badRequest("Minimum version cannot be higher than the latest version.");
  const storeUrl = platform === "android" ? ANDROID_STORE_URL : (body.store_url || null);
  if (body.enabled && !validStoreUrl(platform, storeUrl))
    throw StatusError.badRequest("Enter the App Store link, e.g. https://apps.apple.com/in/app/elexify/id123456789");
  const before = await MobileUpdatePolicy.findOne({ platform }).lean();
  const doc = await MobileUpdatePolicy.findOneAndUpdate(
    { platform },
    { $set: {
      enabled: body.enabled,
      latest_version: body.latest_version,
      minimum_version: body.minimum_version,
      store_url: storeUrl,
      title: body.title ?? "",
      message: body.message ?? "",
      remind_after_hours: body.remind_after_hours,
      updated_by: req.auth.user_id,
    } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  const pick = d => d && { enabled: d.enabled, latest_version: d.latest_version, minimum_version: d.minimum_version, remind_after_hours: d.remind_after_hours };
  await auditService.recordAudit({
    userId: req.auth.user_id, actorId: req.auth.user_id, req,
    event: "MOBILE_UPDATE_POLICY_UPDATED",
    metadata: { platform, before: pick(before), after: pick(doc) },
  });
  res.json({ status: "success", message: "App update policy saved.", data: view(platform, doc, await resolveUpdatePolicy(platform)) });
}));

export { router as mobileUpdatePoliciesRouter };
