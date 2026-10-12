import { Router } from "express";
import * as abandonedCartController from "../../controllers/admin/abandonedCart.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";

const abandonedCartsRouter = Router();
const view = requirePermission(PERMISSIONS.CUSTOMER_VIEW);

abandonedCartsRouter.get("/stats", view, abandonedCartController.stats);
abandonedCartsRouter.get("/settings", view, abandonedCartController.getSettingsHandler);
abandonedCartsRouter.put("/settings", requirePermission(PERMISSIONS.CUSTOMER_NOTIFICATION_SCHEDULE), abandonedCartController.updateSettings);
abandonedCartsRouter.post("/remind", requirePermission(PERMISSIONS.CUSTOMER_NOTIFICATION_SEND), abandonedCartController.remind);
abandonedCartsRouter.get("/", view, abandonedCartController.list);

export { abandonedCartsRouter };
