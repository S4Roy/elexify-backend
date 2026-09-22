import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { masterController } from "../../../controllers/admin/index.js";
import { masterValidation } from "../../../validations/admin/index.js";

const specificationRouter = Router();

specificationRouter.get(
  "/list", requirePermission("specifications.view"),
  masterValidation.specificationValidation.list,
  masterController.specificationController.list
);

specificationRouter.post(
  "/add", requirePermission("specifications.create"),
  masterValidation.specificationValidation.add,
  masterController.specificationController.add
);

specificationRouter.put(
  "/edit", requirePermission("specifications.update"),
  masterValidation.specificationValidation.edit,
  masterController.specificationController.edit
);
specificationRouter.put(
  "/order", requirePermission("specifications.update"),
  masterValidation.specificationValidation.order,
  masterController.specificationController.order
);

specificationRouter.delete(
  "/delete", requirePermission("specifications.delete"),
  masterValidation.specificationValidation.remove,
  masterController.specificationController.remove
);

export { specificationRouter };
