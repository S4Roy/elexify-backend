import { parseAction, saveAction } from "../../../../services/searchInsights/actions.js";
import { logger } from "../../../../config/logger.js";

export const record = async (req, res) => {
  if (process.env.SEARCH_INSIGHTS_ENABLED === "false") return res.sendStatus(204);
  const entry = parseAction(req.body);
  if (!entry) return res.status(400).json({ status: "error", message: "Invalid search event" });
  try {
    await saveAction(entry, req.body.action);
    return res.sendStatus(204);
  } catch {
    logger.warn({ message: "Failed to save search action" });
    return res.status(503).json({ status: "error", message: "Search analytics unavailable" });
  }
};
