import { Router } from "express";
import * as userController from "../../controllers/user/index.js";
import * as userValidation from "../../validations/user/index.js";
import { accountChangeRateLimiter } from "../../middleware/rateLimiter.js";

const accountRouter = Router();

accountRouter.get("/details", userController.accountController.details);

accountRouter.put(
  "/edit",
  userValidation.accountValidation.edit,
  userController.accountController.edit
);

accountRouter.post(
  "/email/request-change",
  accountChangeRateLimiter,
  userValidation.accountValidation.requestEmailChange,
  userController.accountController.requestEmailChange
);

accountRouter.post(
  "/email/verify",
  accountChangeRateLimiter,
  userValidation.accountValidation.verifyEmailChange,
  userController.accountController.verifyEmailChange
);

accountRouter.post(
  "/mobile/request-change",
  accountChangeRateLimiter,
  userValidation.accountValidation.requestMobileChange,
  userController.accountController.requestMobileChange
);

accountRouter.post(
  "/mobile/verify",
  accountChangeRateLimiter,
  userValidation.accountValidation.verifyMobileChange,
  userController.accountController.verifyMobileChange
);

accountRouter.post(
  "/otp/resend",
  accountChangeRateLimiter,
  userValidation.accountValidation.resendOtp,
  userController.accountController.resendOtp
);

accountRouter.get(
  "/notification-preferences",
  userController.accountController.getNotificationPreferences
);

accountRouter.patch(
  "/notification-preferences",
  userValidation.accountValidation.updateNotificationPreferences,
  userController.accountController.updateNotificationPreferences
);

export { accountRouter };
