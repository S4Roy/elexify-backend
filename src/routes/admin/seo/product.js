import { Router } from "express";
import { seoProductController } from "../../../controllers/admin/index.js";
import { seoProductValidation } from "../../../validations/admin/index.js";

const seoProductRouter = Router();

// Literal routes must come before the ":product_id" param route below,
// otherwise Express would swallow them as an id.
seoProductRouter.get("/report", seoProductValidation.report, seoProductController.report);
seoProductRouter.get("/duplicates", seoProductController.duplicates);
seoProductRouter.post(
  "/bulk-generate",
  seoProductValidation.bulkGenerate,
  seoProductController.bulkGenerate
);

seoProductRouter.get("/:product_id", seoProductValidation.get, seoProductController.get);
seoProductRouter.put("/:product_id", seoProductValidation.update, seoProductController.update);
seoProductRouter.post(
  "/:product_id/generate",
  seoProductValidation.generate,
  seoProductController.generate
);

export { seoProductRouter };
