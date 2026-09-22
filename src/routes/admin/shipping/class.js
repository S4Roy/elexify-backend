import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { shippingClassController } from "../../../controllers/admin/index.js";
import { shippingClassValidation } from "../../../validations/admin/index.js";

const shippingClassRouter = Router();

shippingClassRouter.get("/list", requirePermission("shipping_classes.view"), shippingClassValidation.list, shippingClassController.list);
shippingClassRouter.post("/add", requirePermission("shipping_classes.create"), shippingClassValidation.add, shippingClassController.add);
shippingClassRouter.put("/edit", requirePermission("shipping_classes.update"), shippingClassValidation.edit, shippingClassController.edit);
shippingClassRouter.delete("/delete", requirePermission("shipping_classes.delete"), shippingClassValidation.remove, shippingClassController.remove);

export { shippingClassRouter };
