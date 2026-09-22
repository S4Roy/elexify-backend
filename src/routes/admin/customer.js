import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { customerController } from "../../controllers/admin/index.js";
import { customerValidation } from "../../validations/admin/index.js";

const customerRouter = Router();

customerRouter.get("/list", requirePermission("customers.view"), customerValidation.list, customerController.list);
customerRouter.get(
  "/details/:id", requirePermission("customers.view"),
  customerValidation.details,
  customerController.details,
);
customerRouter.post("/add", requirePermission("customers.create"), customerValidation.add, customerController.add);
customerRouter.put("/edit", requirePermission("customers.update"), customerValidation.edit, customerController.edit);
customerRouter.delete(
  "/remove/:id", requirePermission("customers.delete"),
  customerValidation.remove,
  customerController.remove,
);
customerRouter.patch(
  "/change-status", requirePermission("customers.update"),
  customerValidation.changeStatus,
  customerController.changeStatus,
);

export { customerRouter };
