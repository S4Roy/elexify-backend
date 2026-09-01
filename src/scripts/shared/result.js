// Normalizes a handler's return value into the runner's execution-contract
// result shape: {inserted, updated, skipped, deleted, warnings}. Handlers
// may return a partial object (or nothing at all, for read-only health
// checks) — missing counters default to 0, warnings defaults to [].
export const buildResult = ({ inserted = 0, updated = 0, skipped = 0, deleted = 0, warnings = [] } = {}) => ({
  inserted: Number(inserted) || 0,
  updated: Number(updated) || 0,
  skipped: Number(skipped) || 0,
  deleted: Number(deleted) || 0,
  warnings: Array.isArray(warnings) ? warnings : [warnings].filter(Boolean),
});
