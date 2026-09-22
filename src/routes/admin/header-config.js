import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { headerConfigController } from "../../controllers/admin/index.js";
import { headerConfigValidation } from "../../validations/admin/index.js";

const headerConfigRouter = Router();

headerConfigRouter.get("/preview", requirePermission("header.view"), headerConfigController.preview);
headerConfigRouter.post("/publish", requirePermission("header.update"), headerConfigController.publish);
headerConfigRouter.post("/unpublish", requirePermission("header.update"), headerConfigController.unpublish);
headerConfigRouter.get("/", requirePermission("header.view"), headerConfigController.get);
headerConfigRouter.put(
  "/", requirePermission("header.update"),
  headerConfigValidation.update,
  headerConfigController.update
);

export { headerConfigRouter };
