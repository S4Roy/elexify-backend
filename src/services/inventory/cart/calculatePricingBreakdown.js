const money = (value) => Number((Number(value) || 0).toFixed(2));

/**
 * Builds a display-safe breakdown from server-created cart price snapshots.
 * `price` is regular/MRP and `discounted_price` is the final unit price after
 * sale and quantity-tier rules. A tier percentage lets us separate the sale
 * discount from the incremental Buy More Save More discount without applying
 * either discount twice.
 */
export const calculatePricingBreakdown = (carts = [], exchangeRate = 1) => {
  let mrpSubtotalINR = 0;
  let netProductAmountINR = 0;
  let productDiscountINR = 0;
  let quantityDiscountINR = 0;

  for (const cart of carts) {
    const quantity = Math.max(0, Number(cart.quantity) || 0);
    const regular = Math.max(0, Number(cart.price) || 0);
    const effective = Math.max(
      0,
      Number(cart.discounted_price ?? cart.price) || 0,
    );
    const tierPercent = Math.min(
      100,
      Math.max(0, Number(cart.discount_percent) || 0),
    );
    const sellingBeforeTier =
      tierPercent > 0 && tierPercent < 100
        ? effective / (1 - tierPercent / 100)
        : effective;

    mrpSubtotalINR += regular * quantity;
    netProductAmountINR += effective * quantity;
    quantityDiscountINR +=
      Math.max(0, sellingBeforeTier - effective) * quantity;
    productDiscountINR +=
      Math.max(0, regular - sellingBeforeTier) * quantity;
  }

  const convert = (value) => money(value * exchangeRate);
  return {
    mrp_subtotal: convert(mrpSubtotalINR),
    net_product_amount: convert(netProductAmountINR),
    product_discount: convert(productDiscountINR),
    quantity_discount: convert(quantityDiscountINR),
    total_discount: convert(productDiscountINR + quantityDiscountINR),
  };
};
