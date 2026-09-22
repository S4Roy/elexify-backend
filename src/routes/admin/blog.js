import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { blogController } from "../../controllers/admin/index.js";
import { blogValidation } from "../../validations/admin/index.js";

const blogRouter = Router();

blogRouter.get("/list", requirePermission("blogs.view"), blogValidation.list, blogController.list);

blogRouter.post("/add", requirePermission("blogs.create"), blogValidation.add, blogController.add);
blogRouter.put("/edit", requirePermission("blogs.update"), blogValidation.edit, blogController.edit);

blogRouter.delete("/delete", requirePermission("blogs.delete"), blogValidation.remove, blogController.remove);

export { blogRouter };
