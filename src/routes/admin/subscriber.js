import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { subscriberController } from "../../controllers/admin/index.js";
import { subscriberValidation } from "../../validations/admin/index.js";

const subscriberRouter = Router();

subscriberRouter.get(
  "/list", requirePermission("subscribers.view"),
  subscriberValidation.list,
  subscriberController.list
);
subscriberRouter.put(
  "/edit", requirePermission("subscribers.update"),
  subscriberValidation.edit,
  subscriberController.edit
);
subscriberRouter.delete(
  "/delete", requirePermission("subscribers.delete"),
  subscriberValidation.remove,
  subscriberController.remove
);

export { subscriberRouter };
