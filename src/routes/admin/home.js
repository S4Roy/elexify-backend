import { Router } from "express";
import { homeController } from "../../controllers/admin/index.js";
import { homeValidation } from "../../validations/admin/index.js";

const homeRouter = Router();

// Literal routes before the ":id" param route below.
homeRouter.get("/preview", homeController.preview);
homeRouter.post("/publish", homeController.publish);
homeRouter.post("/unpublish", homeController.unpublish);
homeRouter.post("/reorder", homeValidation.reorder, homeController.reorder);

homeRouter.get("/", homeController.get);
homeRouter.put("/", homeValidation.update, homeController.update);

homeRouter.post("/sections", homeValidation.addSection, homeController.addSection);
homeRouter.put(
  "/sections/:id",
  homeValidation.updateSection,
  homeController.updateSection,
);
homeRouter.delete(
  "/sections/:id",
  homeValidation.removeSection,
  homeController.removeSection,
);

export { homeRouter };
