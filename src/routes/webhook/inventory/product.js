import { Router } from "express";
import { inventoryController } from "../../../controllers/webhook/index.js";
import { inventoryValidation } from "../../../validations/site/index.js";

const productRouter = Router();

productRouter.post("/update", inventoryController.productController.update);
productRouter.put("/update", inventoryController.productController.update);
productRouter.patch("/update", inventoryController.productController.update);
productRouter.get("/update", inventoryController.productController.update);

export { productRouter };
