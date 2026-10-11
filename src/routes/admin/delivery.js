import { Router } from "express";
import { celebrate, Joi } from "celebrate";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";
import { failedAttempt, markDelivered, myDeliveries } from "../../controllers/admin/delivery/index.js";

// Own-delivery riders. Every handler is scoped to the caller's assignments.
const deliveryRouter = Router();
const packageIdParam = Joi.object({ id: Joi.string().hex().length(24).required() });

deliveryRouter.get("/mine", requirePermission(PERMISSIONS.DELIVERY_RUN), myDeliveries);
deliveryRouter.post("/:id/delivered", requirePermission(PERMISSIONS.DELIVERY_RUN),
  celebrate({ params: packageIdParam, body: Joi.object({
    delivered_at: Joi.date().iso().max("now").allow("", null),
    receiver_name: Joi.string().trim().min(2).max(100).required(),
    receiver_relation: Joi.string().trim().max(50).allow("", null),
    notes: Joi.string().trim().max(500).allow("", null),
    cod_method: Joi.string().valid("cash", "upi").allow("", null),
    cod_amount: Joi.number().positive().precision(2).when("cod_method", { is: Joi.string().valid("cash", "upi"), then: Joi.required() }),
    cod_reference: Joi.string().trim().max(100).allow("", null),
  }) }), markDelivered);
deliveryRouter.post("/:id/attempt", requirePermission(PERMISSIONS.DELIVERY_RUN),
  celebrate({ params: packageIdParam, body: Joi.object({ reason: Joi.string().trim().min(5).max(500).required() }) }), failedAttempt);

export { deliveryRouter };
