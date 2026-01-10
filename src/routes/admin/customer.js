import { Router } from "express";
import { customerController } from "../../controllers/admin/index.js";
import { customerValidation } from "../../validations/admin/index.js";

const customerRouter = Router();

customerRouter.get("/list", customerValidation.list, customerController.list);

export { customerRouter };
