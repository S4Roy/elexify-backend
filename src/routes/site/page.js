import { Router } from "express";
import { pageController } from "../../controllers/admin/index.js";
import { pageValidation } from "../../validations/admin/index.js";

const pageRouter = Router();

pageRouter.get("/details/:slug", pageValidation.details, pageController.list);

export { pageRouter };
