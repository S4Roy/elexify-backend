import { StatusError } from "../../../../config/index.js";
import { orderService } from "../../../../services/index.js";
import { parseOrderWorkbook } from "../../../../services/orderService/parseOrderWorkbook.js";
import { codRemittanceSummary, importCodRemittance } from "../../../../services/orderService/codRemittance.js";

const MAX_ROWS = 20000;

// Shiprocket COD remittance report upload. dry_run=true (the default)
// previews matches without writing; the admin then re-submits the same file
// with dry_run=false. Re-importing a report is a no-op (AWB+UTR keyed).
export const importRemittance = async (req, res, next) => {
  try {
    const file = req?.files?.file;
    if (!file || Array.isArray(file) || file.truncated || file.size > 5 * 1024 * 1024) {
      throw StatusError.badRequest("Upload the Shiprocket COD remittance report as .csv or .xlsx (form field: file, max 5 MB).");
    }
    if (!/\.(csv|xlsx)$/i.test(file.name || "")) throw StatusError.badRequest("Only a .csv file or .xlsx workbook is accepted.");
    const rows = /\.xlsx$/i.test(file.name) ? await parseOrderWorkbook(file.data) : await orderService.parseCsvBuffer(file.data);
    if (!rows.length) throw StatusError.badRequest("The uploaded file has no rows.");
    if (rows.length > MAX_ROWS) throw StatusError.badRequest(`This file has ${rows.length} rows; the limit per upload is ${MAX_ROWS}.`);

    const apply = String(req.body?.dry_run ?? "true") === "false";
    const report = await importCodRemittance({ rows, apply, adminId: req.auth.user_id });
    return res.status(200).json({ status: "success", data: { filename: file.name, ...report } });
  } catch (error) {
    next(error);
  }
};

export const remittanceSummary = async (req, res, next) => {
  try {
    const data = await codRemittanceSummary({ overdueDays: req.query.overdue_days });
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};
