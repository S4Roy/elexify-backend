import { Router } from "express";
import { mediaController } from "../../controllers/admin/index.js";
import { mediaValidation } from "../../validations/admin/index.js";

const mediaRouter = Router();

mediaRouter.get("/list", mediaValidation.list, mediaController.list);

mediaRouter.get(
  "/details/:slug",
  mediaValidation.details,
  mediaController.list
);

mediaRouter.post("/add", mediaValidation.add, mediaController.add);

mediaRouter.delete("/delete", mediaValidation.remove, mediaController.remove);

export { mediaRouter };
