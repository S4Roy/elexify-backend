import { auditService } from '../index.js';

// Common audit, filename and download response for admin Excel exports.
export const sendWorkbook = async ({ req, res, workbook, entity, event, metadata }) => {
  await auditService.recordAudit({ userId: req.auth.user_id, actorId: req.auth.user_id, req, event, metadata });
  const filename = `${entity}-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
};
