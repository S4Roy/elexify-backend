import { Router } from "express";
import { categoryRouter } from "./category.js";
import { productRouter } from "./product.js";
import { orderRouter } from "./order.js";
import { shippingRouter } from "./shipping.js";

const inventoryRouter = Router();
// All routes go here

inventoryRouter.use("/category", categoryRouter);
inventoryRouter.use("/product", productRouter);
inventoryRouter.use("/order", orderRouter);
inventoryRouter.use("/shipping", shippingRouter);

export { inventoryRouter };
