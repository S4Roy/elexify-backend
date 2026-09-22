import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { navigationPreviewController } from "../../controllers/admin/index.js";

const adminNavigationRouter = Router();

adminNavigationRouter.get("/preview", requirePermission("navigation.view"), navigationPreviewController.preview);

export { adminNavigationRouter };
