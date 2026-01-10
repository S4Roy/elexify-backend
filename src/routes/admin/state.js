import { Router } from "express";
import { stateController } from "../../controllers/admin/index.js";
import { stateValidation } from "../../validations/admin/index.js";

const stateRouter = Router();

stateRouter.get("/list", stateValidation.list, stateController.list);
stateRouter.put("/edit", stateValidation.edit, stateController.edit);

export { stateRouter };
