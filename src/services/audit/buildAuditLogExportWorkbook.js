import ExcelJS from "exceljs";
import AuditLog from "../../models/AuditLog.js";
import { StatusError } from "../../config/index.js";
import { buildAuditLogPipeline } from "./auditLogPipeline.js";

export const buildAuditLogExportWorkbook = async (query = {}) => {
  const pipeline = buildAuditLogPipeline(query);
  pipeline.push({ $limit: 20001 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Audit Logs");
  sheet.columns = [
    ["Timestamp", "timestamp"], ["Event", "event"],
    ["Actor", "actor"], ["Actor email", "actor_email"],
    ["Target user", "target"], ["Target email", "target_email"],
    ["Reason", "reason"], ["IP", "ip"], ["User agent", "user_agent"],
    ["Metadata", "metadata"],
  ].map(([header, key]) => ({ header, key, width: key === "metadata" ? 60 : key === "user_agent" ? 40 : 24 }));

  let count = 0;
  for await (const entry of AuditLog.aggregate(pipeline).cursor({ batchSize: 100 })) {
    if (++count > 20000) throw StatusError.badRequest("Export exceeds 20,000 rows. Narrow the filters and try again.");
    sheet.addRow({
      timestamp: entry.created_at ? new Date(entry.created_at).toISOString() : "",
      event: entry.event,
      actor: entry.actor?.name || "", actor_email: entry.actor?.email || "",
      target: entry.subject?.name || "", target_email: entry.subject?.email || "",
      reason: entry.reason || "",
      ip: entry.ip || "", user_agent: entry.user_agent || "",
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : "",
    });
  }
  if (!count) throw StatusError.badRequest("No audit log entries match the current filters to export.");

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:J1";
  return { workbook, count };
};
