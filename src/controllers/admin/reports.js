import { buildReportWorkbook, listReports, runReport } from "../../services/reports/index.js";
import { sendWorkbook } from "../../services/exportService/sendWorkbook.js";

// Admin sales reports — see services/reports. Query: from, to (or days),
// channel, payment, plus group_by (sales), search/page/limit (breakdowns).
export const list = async (req, res, next) => {
  try {
    res.status(200).json({ status: "success", message: "Reports fetched successfully", data: listReports() });
  } catch (error) { next(error); }
};

export const show = async (req, res, next) => {
  try {
    const data = await runReport(req.params.type, req.query);
    res.status(200).json({ status: "success", message: "Report fetched successfully", data });
  } catch (error) { next(error); }
};

export const exportReport = async (req, res, next) => {
  try {
    const { workbook, count } = await buildReportWorkbook(req.params.type, req.query);
    await sendWorkbook({ req, res, workbook, entity: `${req.params.type.replace(/_/g, "-")}-report`, event: "REPORT_EXPORTED",
      metadata: { report: req.params.type, count, filters: req.query } });
  } catch (error) { next(error); }
};
