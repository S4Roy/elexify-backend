const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Saved line totals include allocated shipping and coupon discounts. Present
// merchandise separately from shipping without modifying the issued snapshot.
export const invoiceDisplayAmounts = (invoice) => {
  const items = Array.from(invoice.items || [], (item) => {
    const total = money(Number(item.total || 0) - Number(item.shipping_allocation || 0));
    const discount = Number(item.discount || 0);
    const gross = money(total + discount);
    return {
      unit_price: item.quantity > 0 ? gross / item.quantity : 0,
      discount,
      total,
      gross,
    };
  });
  return {
    items,
    subtotal: money(items.reduce((sum, item) => sum + item.gross, 0)),
  };
};
