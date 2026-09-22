import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { mediaController } from "../../controllers/admin/index.js";
import { mediaValidation } from "../../validations/admin/index.js";

const mediaRouter = Router();

mediaRouter.get("/list", requirePermission("media.view"), mediaValidation.list, mediaController.list);

mediaRouter.get(
  "/details/:slug", requirePermission("media.view"),
  mediaValidation.details,
  mediaController.list
);

mediaRouter.post("/add", requirePermission("media.create"), mediaValidation.add, mediaController.add);

mediaRouter.put("/edit", requirePermission("media.update"), mediaValidation.edit, mediaController.edit);

mediaRouter.delete("/delete", requirePermission("media.delete"), mediaValidation.remove, mediaController.remove);

mediaRouter.get("/:id/usage", requirePermission("media.view"), mediaValidation.usage, mediaController.usage);

export { mediaRouter };
