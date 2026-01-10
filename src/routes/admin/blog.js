import { Router } from "express";
import { blogController } from "../../controllers/admin/index.js";
import { blogValidation } from "../../validations/admin/index.js";

const blogRouter = Router();

blogRouter.get("/list", blogValidation.list, blogController.list);

blogRouter.post("/add", blogValidation.add, blogController.add);
blogRouter.put("/edit", blogValidation.edit, blogController.edit);

blogRouter.delete("/delete", blogValidation.remove, blogController.remove);

export { blogRouter };
