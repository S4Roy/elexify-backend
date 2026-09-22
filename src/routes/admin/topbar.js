import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { topBarController } from "../../controllers/admin/index.js";
import { topBarValidation } from "../../validations/admin/index.js";

const topbarRouter = Router();

topbarRouter.get("/preview", requirePermission("topbar.view"), topBarController.preview);
topbarRouter.post("/publish", requirePermission("topbar.update"), topBarController.publish);
topbarRouter.post("/unpublish", requirePermission("topbar.update"), topBarController.unpublish);
topbarRouter.get("/", requirePermission("topbar.view"), topBarController.get);
topbarRouter.put("/", requirePermission("topbar.update"), topBarValidation.update, topBarController.update);

export { topbarRouter };
