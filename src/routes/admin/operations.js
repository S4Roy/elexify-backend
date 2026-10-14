import { list as listSearchInsights, trend as searchInsightsTrend } from "../../controllers/admin/operations/searchInsights.js";
import * as searchSynonyms from "../../controllers/admin/operations/searchSynonyms.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { Router } from "express";
import { listOperationalEvents, updateOperationalEvent } from "../../controllers/admin/operations/events.js";
import { list as listCheckoutFailures } from "../../controllers/admin/operations/checkoutFailures.js";
import { list as listWebhookLogs, details as webhookLogDetails } from "../../controllers/admin/operations/webhookLogs.js";

const operationsRouter = Router();
operationsRouter.get("/search-insights", requirePermission("operations.view"), listSearchInsights);
operationsRouter.get("/search-insights/trend", requirePermission("operations.view"), searchInsightsTrend);
operationsRouter.get("/search-synonyms", requirePermission("operations.view"), searchSynonyms.list);
operationsRouter.get("/search-synonyms/lookup", requirePermission("operations.view"), searchSynonyms.findByTerm);
operationsRouter.post("/search-synonyms", requirePermission("operations.update"), searchSynonyms.create);
operationsRouter.put("/search-synonyms/:id", requirePermission("operations.update"), searchSynonyms.update);
operationsRouter.delete("/search-synonyms/:id", requirePermission("operations.update"), searchSynonyms.remove);
operationsRouter.get("/events", requirePermission("operations.view"), listOperationalEvents);
operationsRouter.patch("/events/:id", requirePermission("operations.update"), updateOperationalEvent);
operationsRouter.get("/checkout-failures", requirePermission("operations.view"), listCheckoutFailures);
operationsRouter.get("/webhook-logs", requirePermission("operations.view"), listWebhookLogs);
operationsRouter.get("/webhook-logs/:id", requirePermission("operations.view"), webhookLogDetails);

export { operationsRouter };

