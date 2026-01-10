import { Router } from "express";
import { consultationController } from "../../controllers/admin/index.js";
import { consultationValidation } from "../../validations/admin/index.js";

const consultationRouter = Router();

consultationRouter.get(
  "/list",
  consultationValidation.list,
  consultationController.list
);

export { consultationRouter };
