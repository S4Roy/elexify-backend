import { Router } from "express";
import { currencyController } from "../../controllers/admin/index.js";
import { currencyValidation } from "../../validations/admin/index.js";

const currencyRouter = Router();

currencyRouter.get("/list", currencyValidation.list, currencyController.list);
currencyRouter.put("/edit", currencyValidation.edit, currencyController.edit);

export { currencyRouter };
