import { Router } from "express";
import { categoryRouter } from "./category.js";
import { brandRouter } from "./brand.js";
import { productRouter } from "./product.js";
import { stockRouter } from "./stock.js";
import { attributeRouter } from "./attribute.js";
import { orderRouter } from "./order.js";
import { tagRouter } from "./tag.js";
import { classificationRouter } from "./classification.js";
import { couponRouter } from "./coupon.js";

const inventoryRouter = Router();
// All routes go here

inventoryRouter.use("/category", categoryRouter);
inventoryRouter.use("/brand", brandRouter);
inventoryRouter.use("/tag", tagRouter);
inventoryRouter.use("/classification", classificationRouter);
inventoryRouter.use("/product", productRouter);
inventoryRouter.use("/stock", stockRouter);
inventoryRouter.use("/attribute", attributeRouter);
inventoryRouter.use("/order", orderRouter);
inventoryRouter.use("/coupon", couponRouter);

export { inventoryRouter };
