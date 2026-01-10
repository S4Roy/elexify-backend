import { Router } from "express";
import { authController } from "../../controllers/index.js";
// import {
//   validateAccessToken,
//   validateApiKey,
//   userAdminAccessControl,
// } from "../../middleware/index.js";
import { authValidation } from "../../validations/index.js";
// import { customFileHelper } from "../../helpers/index.js";

const adminAuthRouter = Router();

adminAuthRouter.post(
  "/login",
  authValidation.loginValidation.adminLogin,
  authController.adminLogin
);
adminAuthRouter.post(
  "/request-password-reset",
  authValidation.loginValidation.requestPasswordReset,
  authController.requestPasswordReset
);

adminAuthRouter.post(
  "/reset-password",
  authValidation.loginValidation.resetPassword,
  authController.resetPassword
);

export { adminAuthRouter };
