import { Router } from "express";
import { testimonialController } from "../../controllers/admin/index.js";
import { testimonialValidation } from "../../validations/admin/index.js";

const testimonialRouter = Router();

testimonialRouter.get(
  "/list",
  testimonialValidation.list,
  testimonialController.list
);

testimonialRouter.post(
  "/add",
  testimonialValidation.add,
  testimonialController.add
);

testimonialRouter.delete(
  "/delete",
  testimonialValidation.remove,
  testimonialController.remove
);

export { testimonialRouter };
