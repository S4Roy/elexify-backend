import { Router } from "express";
import { celebrate, Joi } from "celebrate";
import rateLimit from "express-rate-limit";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";
import { StatusError } from "../../config/StatusErrors.js";
import User from "../../models/User.js";
import DeviceToken from "../../models/DeviceToken.js";
import NotificationPreference from "../../models/NotificationPreference.js";
import { pushConfig, eligibleEnvironmentUser } from "../../services/notification/push/config.js";
import { persistPush } from "../../services/notification/push/service.js";

export const customerPushRouter = Router();
const params = { params: Joi.object({ id: Joi.string().hex().length(24).required() }) };
const wrap = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (error) { next(error); }
};
async function state(id) {
  const customer = await User.findOne({ _id: id, role: "customer", deleted_at: null }).select("status").lean();
  if (!customer) throw StatusError.notFound("Customer not found.");
  const config = await pushConfig();
  const [devices, consent] = await Promise.all([
    DeviceToken.find({ user_id: id, environment: config.environment, project_id: config.projectId, is_active: true })
      .select("platform app_version last_seen_at -_id").sort({ last_seen_at: -1 }).limit(100).lean(),
    NotificationPreference.exists({ user_id: id, "marketing.push": true }),
  ]);
  const reason = !config.enabled ? "Push is disabled or not configured."
    : !(await eligibleEnvironmentUser(id, config)) ? "Customer is not allowed in this test environment."
    : customer.status !== "active" ? "Customer account is inactive."
    : !devices.length ? "No active push device registered."
    : !consent ? "Customer has not opted in to marketing push notifications." : null;
  return { devices, can_test: !reason, reason };
}
customerPushRouter.get("/:id/devices", requirePermission(PERMISSIONS.CUSTOMER_NOTIFICATION_VIEW), celebrate(params), wrap(async (req, res) => {
  res.json({ status: "success", data: await state(req.params.id) });
}));
customerPushRouter.post("/:id/test", requirePermission(PERMISSIONS.CUSTOMER_NOTIFICATION_SEND),
  rateLimit({ windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false }),
  celebrate({ ...params, body: Joi.object({ request_id: Joi.string().guid({ version: "uuidv4" }).required() }) }),
  wrap(async (req, res) => {
    const eligibility = await state(req.params.id);
    if (!eligibility.can_test) throw StatusError.badRequest(eligibility.reason);
    const notification = await persistPush(req.params.id, {
      type: "PROMOTIONAL_CAMPAIGN", category: "marketing",
      title: "Elexify test notification",
      body: "This is a test notification from Elexify. Open the app to view your notifications.",
      route: "/notifications", priority: "normal",
    }, { dedupeKey: `admin-test:${req.auth.user_id}:${req.body.request_id}`, expiresAt: new Date(Date.now() + 3600000) });
    if (!notification) throw StatusError.conflict("Test request changed. Retry with the same request ID.");
    res.json({ status: "success", data: { notification_id: notification._id, status: "QUEUED" } });
  }));
