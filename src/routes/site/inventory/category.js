import { Router } from "express";
import { inventoryController } from "../../../controllers/site/index.js";
import { inventoryValidation } from "../../../validations/site/index.js";

const categoryRouter = Router();

categoryRouter.get(
  "/list",
  inventoryValidation.categoryValidation.list,
  inventoryController.categoryController.list
);

categoryRouter.get(
  "/details/:slug",
  inventoryValidation.categoryValidation.details,
  inventoryController.categoryController.list
);

export { categoryRouter };
