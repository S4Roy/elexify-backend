import ShiprocketReconciliationAudit from "../../../../../models/ShiprocketReconciliationAudit.js";

// Recent reconciliation uploads for the admin panel's history view.
// Deliberately excludes `rows` (the full parsed CSV, potentially
// thousands of entries) — the list is a summary; audit.js/apply.js's
// responses already carried the full report at the time each ran.
export const list = async (req, res, next) => {
  try {
    const audits = await ShiprocketReconciliationAudit.find({})
      .select("-rows")
      .sort({ created_at: -1 })
      .limit(20)
      .populate("uploaded_by", "name email")
      .populate("applied_by", "name email")
      .lean();

    return res.status(200).json({ status: "success", data: { audits } });
  } catch (error) {
    next(error);
  }
};
