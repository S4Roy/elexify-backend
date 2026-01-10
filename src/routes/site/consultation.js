import { Router } from "express";
import { consultationController } from "../../controllers/site/index.js";
import { consultationValidation } from "../../validations/site/index.js";

const consultationRouter = Router();

consultationRouter.post(
  "/submit",
  consultationValidation.submit,
  consultationController.submit
);
consultationRouter.post(
  "/verify-payment",
  consultationController.verifyPayment
);

export { consultationRouter };
