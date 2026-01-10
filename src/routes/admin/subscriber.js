import { Router } from "express";
import { subscriberController } from "../../controllers/admin/index.js";
import { subscriberValidation } from "../../validations/admin/index.js";

const subscriberRouter = Router();

subscriberRouter.get(
  "/list",
  subscriberValidation.list,
  subscriberController.list
);
subscriberRouter.put(
  "/edit",
  subscriberValidation.edit,
  subscriberController.edit
);
subscriberRouter.delete(
  "/delete",
  subscriberValidation.remove,
  subscriberController.remove
);

export { subscriberRouter };
