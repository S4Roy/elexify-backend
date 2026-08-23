import { Router } from "express";
import { shippingZoneController } from "../../../controllers/admin/index.js";
import { shippingZoneValidation } from "../../../validations/admin/index.js";

const shippingZoneRouter = Router();

shippingZoneRouter.get("/list", shippingZoneValidation.list, shippingZoneController.list);
shippingZoneRouter.post("/add", shippingZoneValidation.add, shippingZoneController.add);
shippingZoneRouter.put("/edit", shippingZoneValidation.edit, shippingZoneController.edit);
shippingZoneRouter.delete("/delete", shippingZoneValidation.remove, shippingZoneController.remove);

export { shippingZoneRouter };
