import { Router } from "express";
import { subscriberController } from "../../controllers/site/index.js";
import { subscriberValidation } from "../../validations/site/index.js";

const subscriberRouter = Router();

subscriberRouter.post(
  "/submit",
  subscriberValidation.submit,
  subscriberController.submit
);

export { subscriberRouter };
