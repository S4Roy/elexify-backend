// Stock *settings* an admin may set on a SKU from the product form. Only
// fields actually sent are returned, so an older client never resets them.
// Quantities are deliberately absent: they only move through ./mutations.js.
export const stockSettings = (src = {}) => {
  const out = {};
  if (src.manage_stock !== undefined) out.manage_stock = src.manage_stock !== false && src.manage_stock !== "false";
  if (src.allow_backorders !== undefined) out.allow_backorders = src.allow_backorders === true || src.allow_backorders === "true";
  if (src.low_stock_threshold !== undefined) {
    out.low_stock_threshold = src.low_stock_threshold === null || src.low_stock_threshold === "" ? null : Number(src.low_stock_threshold);
  }
  return out;
};
