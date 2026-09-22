import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { shippingZoneController } from "../../../controllers/admin/index.js";
import { shippingZoneValidation } from "../../../validations/admin/index.js";

const shippingZoneRouter = Router();

shippingZoneRouter.get("/list", requirePermission("shipping_zones.view"), shippingZoneValidation.list, shippingZoneController.list);
shippingZoneRouter.post("/add", requirePermission("shipping_zones.create"), shippingZoneValidation.add, shippingZoneController.add);
shippingZoneRouter.put("/edit", requirePermission("shipping_zones.update"), shippingZoneValidation.edit, shippingZoneController.edit);
shippingZoneRouter.delete("/delete", requirePermission("shipping_zones.delete"), shippingZoneValidation.remove, shippingZoneController.remove);

export { shippingZoneRouter };
