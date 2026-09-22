import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { pincodeController } from "../../controllers/admin/index.js";
import { pincodeValidation } from "../../validations/admin/index.js";

const pincodeRouter = Router();

pincodeRouter.get("/list", requirePermission("pincodes.view"), pincodeValidation.list, pincodeController.list);
pincodeRouter.put("/edit", requirePermission("pincodes.update"), pincodeValidation.edit, pincodeController.edit);
pincodeRouter.post("/add", requirePermission("pincodes.create"), pincodeValidation.add, pincodeController.add);

export { pincodeRouter };
