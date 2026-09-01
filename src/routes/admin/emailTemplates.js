import { Router } from "express";
import { emailTemplateController } from "../../controllers/admin/index.js";
import { emailTemplateValidation } from "../../validations/admin/index.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";

const emailTemplatesRouter = Router();

emailTemplatesRouter.get(
  "/",
  requirePermission(PERMISSIONS.EMAIL_TEMPLATE_MANAGE),
  emailTemplateController.list
);

emailTemplatesRouter.post(
  "/seed-run",
  requirePermission(PERMISSIONS.EMAIL_TEMPLATE_MANAGE),
  emailTemplateValidation.seedRun,
  emailTemplateController.seedRun
);

emailTemplatesRouter.get(
  "/:action",
  requirePermission(PERMISSIONS.EMAIL_TEMPLATE_MANAGE),
  emailTemplateController.details
);

emailTemplatesRouter.put(
  "/:action",
  requirePermission(PERMISSIONS.EMAIL_TEMPLATE_MANAGE),
  emailTemplateValidation.update,
  emailTemplateController.update
);

emailTemplatesRouter.post(
  "/:action/reset",
  requirePermission(PERMISSIONS.EMAIL_TEMPLATE_MANAGE),
  emailTemplateValidation.resetToDefault,
  emailTemplateController.resetToDefault
);

emailTemplatesRouter.post(
  "/:action/preview",
  requirePermission(PERMISSIONS.EMAIL_TEMPLATE_MANAGE),
  emailTemplateValidation.preview,
  emailTemplateController.preview
);

emailTemplatesRouter.post(
  "/:action/send-test",
  requirePermission(PERMISSIONS.EMAIL_TEMPLATE_MANAGE),
  emailTemplateValidation.sendTest,
  emailTemplateController.sendTest
);

export { emailTemplatesRouter };
