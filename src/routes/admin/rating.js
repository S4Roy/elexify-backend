import { Router } from "express";
import { ratingController } from "../../controllers/admin/index.js";
import { ratingValidation } from "../../validations/admin/index.js";

const ratingRouter = Router();

ratingRouter.get("/list", ratingValidation.list, ratingController.list);
ratingRouter.put("/edit", ratingValidation.edit, ratingController.edit);
ratingRouter.delete(
  "/delete",
  ratingValidation.remove,
  ratingController.remove
);

export { ratingRouter };
