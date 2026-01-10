import { Router } from "express";
import * as userController from "../../controllers/user/index.js";
import * as userValidation from "../../validations/user/index.js";

const accountRouter = Router();

accountRouter.get("/details", userController.accountController.details);

accountRouter.put(
  "/edit",
  userValidation.accountValidation.edit,
  userController.accountController.edit
);
export { accountRouter };
