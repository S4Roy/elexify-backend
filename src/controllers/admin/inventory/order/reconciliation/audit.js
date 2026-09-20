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
    if (!file) throw StatusError.badRequest("A CSV file is required (form field: file).");
    if (!/\.csv$/i.test(file.name || "")) {
      throw StatusError.badRequest("Only a .csv file is accepted. Export the Shiprocket order report as CSV.");
    }

    const rows = await orderService.parseCsvBuffer(file.data);
    if (!rows.length) throw StatusError.badRequest("The uploaded file has no rows.");
    if (rows.length > MAX_ROWS) {
      throw StatusError.badRequest(`This file has ${rows.length} rows; the limit per upload is ${MAX_ROWS}.`);
    }

    const report = await orderService.reconcileShiprocketOrderStatus({ rows, apply: false });
    const auditDoc = await ShiprocketReconciliationAudit.create({
      filename: file.name,
      rows,
      dry_run_report: report,
      uploaded_by: req.auth.user_id,
    });

    return res.status(200).json({
      status: "success",
      data: { audit_id: auditDoc._id, filename: file.name, report },
    });
  } catch (error) {
    next(error);
  }
};
