import AuditLog from "../../models/AuditLog.js";
import { envs } from "../../config/index.js";
import { buildAuditLogPipeline } from "../../services/audit/auditLogPipeline.js";
import { buildAuditLogExportWorkbook } from "../../services/audit/buildAuditLogExportWorkbook.js";
import { sendWorkbook } from "../../services/exportService/sendWorkbook.js";

// Powers the admin "Audit Logs" view over the append-only trail written by
// services/audit/recordAudit.js. Read-only — nothing here ever writes to
// AuditLog except the export action's own self-audit (see sendWorkbook).
export const list = async (req, res, next) => {
  try {
    const { page = 1, limit = envs.pagination.limit } = req.query;
    const pipeline = buildAuditLogPipeline(req.query);
    const data = await AuditLog.aggregatePaginate(AuditLog.aggregate(pipeline), { page, limit });
    res.status(200).json({ status: "success", message: req.__("Audit logs fetched successfully"), data });
  } catch (error) { next(error); }
};

// Populates the event filter dropdown from the schema itself, so it never
// drifts out of sync with the events the codebase actually writes.
export const listEvents = async (req, res, next) => {
  try {
    const events = AuditLog.schema.path("event").enumValues;
    res.status(200).json({ status: "success", message: req.__("Audit log events fetched successfully"), data: events });
  } catch (error) { next(error); }
};

export const exportAuditLogs = async (req, res, next) => {
  try {
    const { workbook, count } = await buildAuditLogExportWorkbook(req.query);
    await sendWorkbook({ req, res, workbook, entity: "audit-logs", event: "AUDIT_LOG_EXPORTED",
      metadata: { count, filters: req.query } });
  } catch (error) { next(error); }
};
