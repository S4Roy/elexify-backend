import { requirePermission } from "../../../middleware/requirePermission.js";
import { Router } from "express";
import { seoProductController } from "../../../controllers/admin/index.js";
import { seoProductValidation } from "../../../validations/admin/index.js";

const seoProductRouter = Router();

// Literal routes must come before the ":product_id" param route below,
// otherwise Express would swallow them as an id.
seoProductRouter.get("/report", requirePermission("seo.view"), seoProductValidation.report, seoProductController.report);
seoProductRouter.get("/duplicates", requirePermission("seo.view"), seoProductController.duplicates);
seoProductRouter.post(
  "/bulk-generate", requirePermission("seo.update"),
  seoProductValidation.bulkGenerate,
  seoProductController.bulkGenerate
);

seoProductRouter.get("/:product_id", requirePermission("seo.view"), seoProductValidation.get, seoProductController.get);
seoProductRouter.put("/:product_id", requirePermission("seo.update"), seoProductValidation.update, seoProductController.update);
seoProductRouter.post(
  "/:product_id/generate", requirePermission("seo.update"),
  seoProductValidation.generate,
  seoProductController.generate
);

export { seoProductRouter };
