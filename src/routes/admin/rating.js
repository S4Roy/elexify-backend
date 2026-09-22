import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { ratingController } from "../../controllers/admin/index.js";
import { ratingValidation } from "../../validations/admin/index.js";

const ratingRouter = Router();

ratingRouter.get("/list", requirePermission("ratings.view"), ratingValidation.list, ratingController.list);
ratingRouter.put("/edit", requirePermission("ratings.update"), ratingValidation.edit, ratingController.edit);
ratingRouter.delete(
  "/delete", requirePermission("ratings.delete"),
  ratingValidation.remove,
  ratingController.remove
);

export { ratingRouter };
