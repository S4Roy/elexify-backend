import { requirePermission, requireAnyPermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { pageController } from "../../controllers/admin/index.js";
import { pageValidation } from "../../validations/admin/index.js";

const pageRouter = Router();

pageRouter.get("/list", requirePermission("pages.view"), pageValidation.list, pageController.list);

pageRouter.get("/details/:slug", requirePermission("pages.view"), pageValidation.details, pageController.list);

pageRouter.post("/add", requireAnyPermission("pages.create", "pages.update"), pageValidation.add, pageController.add);


pageRouter.delete("/delete", requirePermission("pages.delete"), pageValidation.remove, pageController.remove);

export { pageRouter };
