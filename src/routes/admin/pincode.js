import { Router } from "express";
import { pincodeController } from "../../controllers/admin/index.js";
import { pincodeValidation } from "../../validations/admin/index.js";

const pincodeRouter = Router();

pincodeRouter.get("/list", pincodeValidation.list, pincodeController.list);
pincodeRouter.put("/edit", pincodeValidation.edit, pincodeController.edit);
pincodeRouter.post("/add", pincodeValidation.add, pincodeController.add);

export { pincodeRouter };
