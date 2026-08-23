import { Router } from "express";
import { seoProductRouter } from "./product.js";
import { seoSettingsRouter } from "./settings.js";

const seoRouter = Router();

seoRouter.use("/product", seoProductRouter);
seoRouter.use("/settings", seoSettingsRouter);

export { seoRouter };
