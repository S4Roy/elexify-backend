import { Router } from "express";
import { userController } from "../../controllers/admin/index.js";
import { userValidation } from "../../validations/admin/index.js";

const userRouter = Router();

userRouter.post(
  "/change-password",
  userValidation.changePassword,
  userController.changePassword
);

export { userRouter };
