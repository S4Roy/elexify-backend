import { requireRecaptcha } from "../../middleware/recaptcha.js";
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
userAuthRouter.use((req, res, next) => {
  if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ status: 'error', message: 'JSON request required' });
  next();
});

userAuthRouter.post(
  "/signup", requireRecaptcha("registration"),
  authValidation.loginValidation.signup,
  authController.userSignup
);
userAuthRouter.post(
  "/login", requireRecaptcha("login"),
  authValidation.loginValidation.adminLogin,
  authController.userLogin
);
userAuthRouter.post(
  "/request-password-reset", requireRecaptcha("forgot_password"),
  authValidation.loginValidation.requestPasswordReset,
  authController.requestPasswordReset
);

userAuthRouter.post(
  "/reset-password", requireRecaptcha("forgot_password"),
  authValidation.loginValidation.resetPassword,
  authController.resetPassword
);

// OTP Based Login
userAuthRouter.post(
  "/send-otp", requireRecaptcha("login"),
  authValidation.loginValidation.sendOtp,
  authController.sendOtpToUser
);
userAuthRouter.post(
  "/verify-otp", requireRecaptcha("login"),
  authValidation.loginValidation.verifyOtp,
  authController.verifyUserOtp
);

// Google Sign-In
userAuthRouter.post(
  "/google", requireRecaptcha("login"),
  authValidation.loginValidation.googleLogin,
  authController.googleLogin
);

export { userAuthRouter };
