import { Router } from "express";
import { listOperationalEvents, updateOperationalEvent } from "../../controllers/admin/operations/events.js";
import { list as listWebhookLogs, details as webhookLogDetails } from "../../controllers/admin/operations/webhookLogs.js";

const operationsRouter = Router();
operationsRouter.get("/events", listOperationalEvents);
operationsRouter.patch("/events/:id", updateOperationalEvent);
operationsRouter.get("/webhook-logs", listWebhookLogs);
operationsRouter.get("/webhook-logs/:id", webhookLogDetails);

export { operationsRouter };

