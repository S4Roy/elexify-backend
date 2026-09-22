import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { currencyController } from "../../controllers/admin/index.js";
import { currencyValidation } from "../../validations/admin/index.js";

const currencyRouter = Router();

currencyRouter.get("/list", requirePermission("currency.view"), currencyValidation.list, currencyController.list);
currencyRouter.put("/edit", requirePermission("currency.update"), currencyValidation.edit, currencyController.edit);

export { currencyRouter };
