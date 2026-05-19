import { Router } from "express";
import { customerController } from "../../controllers/admin/index.js";
import { customerValidation } from "../../validations/admin/index.js";

const customerRouter = Router();

customerRouter.get("/list", customerValidation.list, customerController.list);
customerRouter.get(
  "/details/:id",
  customerValidation.details,
  customerController.details,
);
customerRouter.post("/add", customerValidation.add, customerController.add);
customerRouter.put("/edit", customerValidation.edit, customerController.edit);
customerRouter.delete(
  "/remove/:id",
  customerValidation.remove,
  customerController.remove,
);
customerRouter.patch(
  "/change-status",
  customerValidation.changeStatus,
  customerController.changeStatus,
);

export { customerRouter };
