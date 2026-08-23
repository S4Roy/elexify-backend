import { Router } from "express";
import { topBarController } from "../../controllers/admin/index.js";
import { topBarValidation } from "../../validations/admin/index.js";

const topbarRouter = Router();

topbarRouter.get("/preview", topBarController.preview);
topbarRouter.post("/publish", topBarController.publish);
topbarRouter.post("/unpublish", topBarController.unpublish);
topbarRouter.get("/", topBarController.get);
topbarRouter.put("/", topBarValidation.update, topBarController.update);

export { topbarRouter };
