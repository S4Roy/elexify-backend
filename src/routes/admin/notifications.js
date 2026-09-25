import { customerPushRouter } from "./customerPush.js";
import { pushCampaignsRouter } from './pushCampaigns.js';
import { Router } from "express";
import { notificationController } from "../../controllers/admin/index.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";

const notificationsRouter = Router();
notificationsRouter.use("/campaigns", pushCampaignsRouter);
notificationsRouter.use("/customers", customerPushRouter);

notificationsRouter.get(
  "/history",
  requirePermission(PERMISSIONS.CUSTOMER_NOTIFICATION_VIEW),
  notificationController.history
);

notificationsRouter.get(
  "/dead-letter",
  requirePermission(PERMISSIONS.CUSTOMER_NOTIFICATION_VIEW),
  notificationController.deadLetter
);

notificationsRouter.post(
  "/:jobId/retry",
  requirePermission(PERMISSIONS.CUSTOMER_NOTIFICATION_RETRY),
  notificationController.retry
);

notificationsRouter.get(
  "/summary",
  requirePermission(PERMISSIONS.CUSTOMER_NOTIFICATION_VIEW),
  notificationController.summary
);

export { notificationsRouter };
