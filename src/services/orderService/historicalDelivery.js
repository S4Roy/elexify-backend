// Only the verified delivery import may correct historical fulfillment without
// a local payment receipt. This never establishes payment or changes balances.
export const isHistoricalImportedOrder = order =>
  order?.is_migrated === true && Boolean(order?.legacy_import?.source);

export const canCorrectHistoricalDelivery = (order, verified, status) =>
  verified === true && status === 'delivered' && isHistoricalImportedOrder(order);
