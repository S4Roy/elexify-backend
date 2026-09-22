import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { testimonialController } from "../../controllers/admin/index.js";
import { testimonialValidation } from "../../validations/admin/index.js";

const testimonialRouter = Router();

testimonialRouter.get(
  "/list", requirePermission("testimonials.view"),
  testimonialValidation.list,
  testimonialController.list
);

testimonialRouter.post(
  "/add", (req, res, next) => requirePermission(req.body._id ? "testimonials.update" : "testimonials.create")(req, res, next),
  testimonialValidation.add,
  testimonialController.add
);

testimonialRouter.delete(
  "/delete", requirePermission("testimonials.delete"),
  testimonialValidation.remove,
  testimonialController.remove
);

export { testimonialRouter };
