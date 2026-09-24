import { Router } from "express";
import * as auditLogController from "../../controllers/admin/auditLog.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";

const auditLogsRouter = Router();
const guard = requirePermission(PERMISSIONS.AUDIT_LOG_VIEW);

auditLogsRouter.get("/events", guard, auditLogController.listEvents);
auditLogsRouter.get("/export", guard, auditLogController.exportAuditLogs);
auditLogsRouter.get("/", guard, auditLogController.list);

export { auditLogsRouter };
