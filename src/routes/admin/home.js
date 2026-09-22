import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { homeController } from "../../controllers/admin/index.js";
import { homeValidation } from "../../validations/admin/index.js";

const homeRouter = Router();

// Literal routes before the ":id" param route below.
homeRouter.get("/preview", requirePermission("home.view"), homeController.preview);
homeRouter.post("/publish", requirePermission("home.update"), homeController.publish);
homeRouter.post("/unpublish", requirePermission("home.update"), homeController.unpublish);
homeRouter.post("/reorder", requirePermission("home.update"), homeValidation.reorder, homeController.reorder);

homeRouter.get("/", requirePermission("home.view"), homeController.get);
homeRouter.put("/", requirePermission("home.update"), homeValidation.update, homeController.update);

homeRouter.post("/sections", requirePermission("home.create"), homeValidation.addSection, homeController.addSection);
homeRouter.put(
  "/sections/:id", requirePermission("home.update"),
  homeValidation.updateSection,
  homeController.updateSection,
);
homeRouter.delete(
  "/sections/:id", requirePermission("home.delete"),
  homeValidation.removeSection,
  homeController.removeSection,
);

export { homeRouter };
