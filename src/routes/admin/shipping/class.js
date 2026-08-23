import { Router } from "express";
import { shippingClassController } from "../../../controllers/admin/index.js";
import { shippingClassValidation } from "../../../validations/admin/index.js";

const shippingClassRouter = Router();

shippingClassRouter.get("/list", shippingClassValidation.list, shippingClassController.list);
shippingClassRouter.post("/add", shippingClassValidation.add, shippingClassController.add);
shippingClassRouter.put("/edit", shippingClassValidation.edit, shippingClassController.edit);
shippingClassRouter.delete("/delete", shippingClassValidation.remove, shippingClassController.remove);

export { shippingClassRouter };
