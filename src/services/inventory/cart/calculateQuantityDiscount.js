/**
 * Pick the highest-qualifying quantity discount tier and apply it to the base unit price.
 * @param {{ basePrice: number, quantity: number, tiers: {min_quantity: number, discount_percent: number}[] }} params
 * @returns {{ unitPrice: number, discountPercent: number, tier: object|null }}
 */
export const calculateQuantityDiscount = ({ basePrice, quantity, tiers = [] }) => {
  const eligible = (tiers || [])
    .filter((t) => quantity >= t.min_quantity)
    .sort((a, b) => b.min_quantity - a.min_quantity);

  const tier = eligible[0] || null;

  if (!tier) {
    return { unitPrice: basePrice, discountPercent: 0, tier: null };
  }

  const unitPrice = parseFloat(
    (basePrice * (1 - tier.discount_percent / 100)).toFixed(2)
  );

  return { unitPrice, discountPercent: tier.discount_percent, tier };
};
