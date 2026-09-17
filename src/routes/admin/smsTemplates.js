import { Router } from "express";
import { smsTemplateController } from "../../controllers/admin/index.js";
import { smsTemplateValidation } from "../../validations/admin/index.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";

const smsTemplatesRouter = Router();

smsTemplatesRouter.get(
  "/",
  requirePermission(PERMISSIONS.SMS_TEMPLATE_MANAGE),
  smsTemplateController.list
);

smsTemplatesRouter.post(
  "/seed-run",
  requirePermission(PERMISSIONS.SMS_TEMPLATE_MANAGE),
  smsTemplateValidation.seedRun,
  smsTemplateController.seedRun
);

smsTemplatesRouter.get(
  "/:event",
  requirePermission(PERMISSIONS.SMS_TEMPLATE_MANAGE),
  smsTemplateController.details
);

smsTemplatesRouter.put(
  "/:event",
  requirePermission(PERMISSIONS.SMS_TEMPLATE_MANAGE),
  smsTemplateValidation.update,
  smsTemplateController.update
);

smsTemplatesRouter.post(
  "/:event/reset",
  requirePermission(PERMISSIONS.SMS_TEMPLATE_MANAGE),
  smsTemplateValidation.resetToDefault,
  smsTemplateController.resetToDefault
);

export { smsTemplatesRouter };
