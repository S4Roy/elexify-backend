import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { stateController } from "../../controllers/admin/index.js";
import { stateValidation } from "../../validations/admin/index.js";

const stateRouter = Router();

stateRouter.get("/list", requirePermission("states.view"), stateValidation.list, stateController.list);
stateRouter.put("/edit", requirePermission("states.update"), stateValidation.edit, stateController.edit);

export { stateRouter };
