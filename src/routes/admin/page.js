import { Router } from "express";
import { pageController } from "../../controllers/admin/index.js";
import { pageValidation } from "../../validations/admin/index.js";

const pageRouter = Router();

pageRouter.get("/list", pageValidation.list, pageController.list);

pageRouter.get("/details/:slug", pageValidation.details, pageController.list);

pageRouter.post("/add", pageValidation.add, pageController.add);


pageRouter.delete("/delete", pageValidation.remove, pageController.remove);

export { pageRouter };
