import { sendWorkbook } from "../../../../services/exportService/sendWorkbook.js";
import { buildOrderMatchFilter } from "../../../../services/orderService/buildOrderMatchFilter.js";
import { buildOrdersExportWorkbook } from "../../../../services/orderService/exportOrders.js";


// Exports the Orders list to .xlsx, matching the table's current
// filter/search (default) or a hand-picked selection of rows (order_ids) —
// the same two export modes every mainstream e-commerce admin offers.
export const exportOrders = async (req, res, next) => {
  try {
    const { sort_by = "id", sort_order = -1, order_ids = "" } = req.query;
    const matchFilter = buildOrderMatchFilter(req.query, req.auth);
    const orderIds = order_ids ? order_ids.split(",").map((id) => id.trim()).filter(Boolean) : [];

    const { workbook, count } = await buildOrdersExportWorkbook({
      matchFilter,
      orderIds,
      sortBy: sort_by,
      sortOrder: parseInt(sort_order),
    });

    await sendWorkbook({ req, res, workbook, entity: 'orders', event: 'ORDER_EXPORTED', metadata: { count, selection: orderIds.length ? 'selected' : 'filtered', order_ids: orderIds } });
  } catch (error) {
    next(error);
  }
};
