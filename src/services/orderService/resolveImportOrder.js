import Order from '../../models/Order.js';
import Package from '../../models/Package.js';
import { packageReferenceQuery, orderReferenceQuery } from '../../helpers/order/shipmentReferences.js';

// Package first, then legacy order: same precedence/keys as the webhook.
// Imports report ambiguous matches instead of choosing an arbitrary document.
export const resolveImportOrder = async reference => {
  const identifiers = { orderIds: [reference] };
  const packages = await Package.find(packageReferenceQuery(identifiers)).limit(2);
  if (packages.length > 1) throw Error('Multiple packages match this reference. Review the stored shipment links.');
  if (packages.length) {
    const order = await Order.findOne({ _id: packages[0].order_id, deleted_at: null });
    return order ? { order, matchedBy: 'package', packageId: String(packages[0]._id) } : null;
  }
  const orders = await Order.find({ ...orderReferenceQuery(identifiers), deleted_at: null }).limit(2);
  if (orders.length > 1) throw Error('Multiple orders match this reference. Review the stored Shiprocket links.');
  if (!orders.length) return null;
  return { order: orders[0], matchedBy: String(orders[0].id) === reference ? 'order_id' : 'shiprocket_order_id' };
};
