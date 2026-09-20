import { parseOrderWorkbook } from "../../../../../services/orderService/parseOrderWorkbook.js";
import { auditForceOrderStatusImport } from "../../../../../services/orderService/forceOrderStatusImport.js";
import { auditLiveShiprocketImport, normalizeImportRows } from "../../../../../services/orderService/liveShiprocketImport.js";
import { StatusError } from "../../../../../config/index.js";
import { orderService } from "../../../../../services/index.js";
import ShiprocketReconciliationAudit from "../../../../../models/ShiprocketReconciliationAudit.js";

const MAX_ROWS = 20000;

// Step 1 of the admin panel's Shiprocket reconciliation flow: upload the
// Shiprocket order export as CSV, get back a dry-run report (zero writes)
// plus an audit_id — pass that id to apply.js to actually write the
// matched changes. See services/orderService/reconcileShiprocketOrderStatus.js
// for the matching logic itself.
export const audit = async (req, res, next) => {
  try {
    const file = req?.files?.file;
    if (!file || Array.isArray(file) || file.truncated || file.size > 5 * 1024 * 1024) throw StatusError.badRequest("A CSV file is required, or upload an XLSX workbook (form field: file).");
    if (!/\.(csv|xlsx)$/i.test(file.name || "")) {
      throw StatusError.badRequest("Only a .csv file or .xlsx workbook is accepted.");
    }

    let rows = /\.xlsx$/i.test(file.name) ? await parseOrderWorkbook(file.data) : await orderService.parseCsvBuffer(file.data);
    if (!rows.length) throw StatusError.badRequest("The uploaded file has no rows.");
    if (rows.length > MAX_ROWS) {
      throw StatusError.badRequest(`This file has ${rows.length} rows; the limit per upload is ${MAX_ROWS}.`);
    }

    const live = req.body?.mode === 'live_delivered';
    const force = req.body?.mode === 'force_status';
    if (force && !rows.every(row => (row['Order ID'] ?? row.shiprocket_order_id) != null && (row.Status ?? row.status) != null)) throw StatusError.badRequest('File must contain Order ID and Status columns.');
    if (live) rows = normalizeImportRows(rows);
    if (live && !rows.every(row => row['Order ID'] != null && row.Status != null)) throw StatusError.badRequest('CSV must contain Order ID and Status columns.');
    const result = force ? await auditForceOrderStatusImport(rows) : live ? await auditLiveShiprocketImport(rows) : null;
    const report = result?.report || await orderService.reconcileShiprocketOrderStatus({ rows, apply: false });
    const auditDoc = await ShiprocketReconciliationAudit.create({
      filename: file.name,
      mode: force ? "force_status" : live ? "live_delivered" : "snapshot",
      candidates: result?.candidates || [],
      rows,
      dry_run_report: report,
      uploaded_by: req.auth.user_id,
    });

    return res.status(200).json({
      status: "success",
      data: { audit_id: auditDoc._id, filename: file.name, report, mode: auditDoc.mode, total: result?.candidates.length || 0 },
    });
  } catch (error) {
    next(error);
  }
};
