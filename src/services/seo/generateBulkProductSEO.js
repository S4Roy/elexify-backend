import { generateProductSEO } from "./generateProductSEO.js";
import { getProductSeoRows, applySeoReportFilter } from "./getProductSeoRows.js";

// No job-queue infra exists in this codebase (mirrors the existing bulk
// product import, which is also synchronous-in-request) — runs sequentially
// within the request. Fine for current catalog sizes.
export const generateBulkProductSEO = async ({ productIds, filter, overwrite = false, actorId = null } = {}) => {
  let ids = [];
  if (Array.isArray(productIds) && productIds.length) {
    ids = productIds;
  } else {
    const rows = await getProductSeoRows({});
    ids = applySeoReportFilter(rows, filter).map((row) => String(row.product._id));
  }

  const result = { processed: 0, skipped: 0, failed: [] };
  for (const id of ids) {
    try {
      const { wrote } = await generateProductSEO(id, { actorId, overwrite });
      if (wrote.title || wrote.description) {
        result.processed += 1;
      } else {
        // Both fields were manually edited and overwrite wasn't requested —
        // nothing to (re)generate for this product.
        result.skipped += 1;
      }
    } catch (error) {
      result.failed.push({ productId: id, error: error.message });
    }
  }
  return result;
};
