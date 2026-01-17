import { Router } from "express";
import { authController } from "../../controllers/index.js";
// import {
//   validateAccessToken,
//   validateApiKey,
//   userAdminAccessControl,
// } from "../../middleware/index.js";
import { authValidation } from "../../validations/index.js";
// import { customFileHelper } from "../../helpers/index.js";

const userAuthRouter = Router();

userAuthRouter.post(
  "/signup",
  authValidation.loginValidation.signup,
  authController.userSignup
);
userAuthRouter.post(
  "/login",
  authValidation.loginValidation.adminLogin,
  authController.userLogin
);
userAuthRouter.post(
  "/request-password-reset",
  authValidation.loginValidation.requestPasswordReset,
  authController.requestPasswordReset
);

userAuthRouter.post(
  "/reset-password",
  authValidation.loginValidation.resetPassword,
  authController.resetPassword
);

// OTP Based Login
userAuthRouter.post(
  "/send-otp",
  authValidation.loginValidation.sendOtp,
  authController.sendOtpToUser
);
userAuthRouter.post(
  "/verify-otp",
  authValidation.loginValidation.verifyOtp,
  authController.verifyUserOtp
);

export { userAuthRouter };
