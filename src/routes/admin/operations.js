import { Router } from "express";
import { listOperationalEvents, updateOperationalEvent } from "../../controllers/admin/operations/events.js";

const operationsRouter = Router();
operationsRouter.get("/events", listOperationalEvents);
operationsRouter.patch("/events/:id", updateOperationalEvent);

export { operationsRouter };

