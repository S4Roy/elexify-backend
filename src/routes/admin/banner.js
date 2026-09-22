import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { bannerController } from "../../controllers/admin/index.js";
import { bannerValidation } from "../../validations/admin/index.js";

const bannerRouter = Router();

bannerRouter.get("/list", requirePermission("banners.view"), bannerValidation.list, bannerController.list);

bannerRouter.post("/add", requirePermission("banners.create"), bannerValidation.add, bannerController.add);
bannerRouter.put("/edit", requirePermission("banners.update"), bannerValidation.edit, bannerController.edit);

bannerRouter.delete(
  "/delete", requirePermission("banners.delete"),
  bannerValidation.remove,
  bannerController.remove
);

export { bannerRouter };
