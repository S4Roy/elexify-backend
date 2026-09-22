import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { listOperationalEvents, updateOperationalEvent } from "../../controllers/admin/operations/events.js";
import { list as listWebhookLogs, details as webhookLogDetails } from "../../controllers/admin/operations/webhookLogs.js";

const operationsRouter = Router();
operationsRouter.get("/events", requirePermission("operations.view"), listOperationalEvents);
operationsRouter.patch("/events/:id", requirePermission("operations.update"), updateOperationalEvent);
operationsRouter.get("/webhook-logs", requirePermission("operations.view"), listWebhookLogs);
operationsRouter.get("/webhook-logs/:id", requirePermission("operations.view"), webhookLogDetails);

export { operationsRouter };

