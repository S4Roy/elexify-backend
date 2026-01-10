import { Router } from "express";
import { masterController } from "../../../controllers/admin/index.js";
import { masterValidation } from "../../../validations/admin/index.js";

const specificationRouter = Router();

specificationRouter.get(
  "/list",
  masterValidation.specificationValidation.list,
  masterController.specificationController.list
);

specificationRouter.post(
  "/add",
  masterValidation.specificationValidation.add,
  masterController.specificationController.add
);

specificationRouter.put(
  "/edit",
  masterValidation.specificationValidation.edit,
  masterController.specificationController.edit
);
specificationRouter.put(
  "/order",
  masterValidation.specificationValidation.order,
  masterController.specificationController.order
);

specificationRouter.delete(
  "/delete",
  masterValidation.specificationValidation.remove,
  masterController.specificationController.remove
);

export { specificationRouter };
