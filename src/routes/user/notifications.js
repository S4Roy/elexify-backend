import { Router } from "express";
import { celebrate, Joi } from "celebrate";
import rateLimit from "express-rate-limit";
import { StatusError } from "../../config/StatusErrors.js";
import DeviceToken from "../../models/DeviceToken.js";
import PushNotification from "../../models/PushNotification.js";
import { registerDevice } from "../../services/notification/push/service.js";
const id = Joi.string().hex().length(24).required();
const wrap = (fn) => async (req, res, next) => {
  try {
    if (!req.auth?.user_id)
      throw StatusError.unauthorized("Invalid access token.");
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};
const ok = (res, data) => res.json({ status: "success", data });
const owner = (req) => ({
  user_id: req.auth.user_id,
  environment: process.env.APP_ENV,
});
const visible = (req) => ({ ...owner(req), expires_at: { $gt: new Date() } });
export const deviceTokensRouter = Router();
deviceTokensRouter.use(
  rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
deviceTokensRouter.post(
  "/",
  celebrate({
    body: Joi.object({
      token: Joi.string().min(20).max(4096).required(),
      device_id: Joi.string()
        .pattern(/^[A-Za-z0-9_-]{16,100}$/)
        .required(),
      platform: Joi.string().valid("android", "ios").required(),
      app_version: Joi.string().max(50),
      environment: Joi.string()
        .valid("development", "staging", "production")
        .required(),
      firebase_project_id: Joi.string().max(200).required(),
    }),
  }),
  wrap(async (req, res) => {
    try {
      const d = await registerDevice(req.auth.user_id, req.body);
      ok(res, {
        device: { id: d._id, device_id: d.device_id, is_active: d.is_active },
      });
    } catch (e) {
      const safe = [
        "Push configuration does not match this app.",
        "Token is already registered to another installation.",
        "Device limit reached. Remove an old device first.",
      ];
      if (e.code === 11000)
        throw StatusError.conflict(
          "Device registration changed. Please retry."
        );
      if (safe.includes(e.message)) throw StatusError.badRequest(e.message);
      throw StatusError.serverError(
        "Device registration failed. Please retry."
      );
    }
  })
);
deviceTokensRouter.delete(
  "/:deviceId",
  celebrate({
    params: Joi.object({
      deviceId: Joi.string()
        .pattern(/^[A-Za-z0-9_-]{16,100}$/)
        .required(),
    }),
  }),
  wrap(async (req, res) => {
    await DeviceToken.updateOne(
      { ...owner(req), device_id: req.params.deviceId },
      { $set: { is_active: false } }
    );
    ok(res, {});
  })
);
export const userNotificationsRouter = Router();
userNotificationsRouter.get(
  "/",
  celebrate({
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(100).default(25),
      cursor: id.optional(),
    }),
  }),
  wrap(async (req, res) => {
    const limit = Number(req.query.limit || 25);
    const rows = await PushNotification.find({
      ...visible(req),
      ...(req.query.cursor ? { _id: { $lt: req.query.cursor } } : {}),
    })
      .select("-dedupe_key -queued -user_id")
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    ok(res, { items, next_cursor: hasMore ? String(items.at(-1)._id) : null });
  })
);
userNotificationsRouter.get(
  "/unread-count",
  wrap(async (req, res) =>
    ok(res, {
      count: await PushNotification.countDocuments({
        ...visible(req),
        read_at: null,
      }),
    })
  )
);
userNotificationsRouter.patch(
  "/read-all",
  wrap(async (req, res) => {
    await PushNotification.updateMany(
      { ...visible(req), read_at: null },
      { $set: { read_at: new Date() } }
    );
    ok(res, {});
  })
);
userNotificationsRouter.get(
  "/:id",
  celebrate({ params: Joi.object({ id }) }),
  wrap(async (req, res) => {
    const notification = await PushNotification.findOne({
      ...visible(req),
      _id: req.params.id,
    })
      .select("-dedupe_key -queued -user_id")
      .lean();
    if (!notification)
      throw StatusError.notFound("Notification is unavailable.");
    ok(res, { notification });
  })
);
userNotificationsRouter.patch(
  "/:id/read",
  celebrate({ params: Joi.object({ id }) }),
  wrap(async (req, res) => {
    const notification = await PushNotification.findOne({
      ...visible(req),
      _id: req.params.id,
    }).select("_id");
    if (!notification)
      throw StatusError.notFound("Notification is unavailable.");
    await PushNotification.updateOne(
      { ...owner(req), _id: notification._id, read_at: null },
      { $set: { read_at: new Date() } }
    );
    ok(res, {});
  })
);
