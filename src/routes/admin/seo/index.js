import { Router } from "express";
import { seoProductRouter } from "./product.js";
import { seoCategoryRouter } from "./category.js";
import { seoSettingsRouter } from "./settings.js";

const seoRouter = Router();

seoRouter.use("/product", seoProductRouter);
seoRouter.use("/category", seoCategoryRouter);
seoRouter.use("/settings", seoSettingsRouter);

export { seoRouter };
