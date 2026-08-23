import { Router } from "express";
import { navigationPreviewController } from "../../controllers/admin/index.js";

const adminNavigationRouter = Router();

adminNavigationRouter.get("/preview", navigationPreviewController.preview);

export { adminNavigationRouter };
