import { Router } from "express";
import { cmsController } from "../../controllers/site/index.js";
import { cmsValidation } from "../../validations/site/index.js";

const cmsRouter = Router();

cmsRouter.get("/faqs", cmsValidation.list, cmsController.faqList);
cmsRouter.get("/ratings", cmsValidation.list, cmsController.ratingList);
cmsRouter.get("/page/:slug", cmsController.pageContent);
cmsRouter.get("/banners", cmsController.banners);
cmsRouter.get("/blogs", cmsController.blogs);
cmsRouter.get("/blog-filter-option", cmsController.blog_filter_option);
cmsRouter.get("/settings", cmsController.settings);
export { cmsRouter };
