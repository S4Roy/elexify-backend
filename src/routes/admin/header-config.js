import { Router } from "express";
import { headerConfigController } from "../../controllers/admin/index.js";
import { headerConfigValidation } from "../../validations/admin/index.js";

const headerConfigRouter = Router();

headerConfigRouter.get("/preview", headerConfigController.preview);
headerConfigRouter.post("/publish", headerConfigController.publish);
headerConfigRouter.post("/unpublish", headerConfigController.unpublish);
headerConfigRouter.get("/", headerConfigController.get);
headerConfigRouter.put(
  "/",
  headerConfigValidation.update,
  headerConfigController.update
);

export { headerConfigRouter };
