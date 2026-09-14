import mongoose from 'mongoose';
import Order from '../../models/Order.js';
import OrderItem from '../../models/OrderItem.js';
import ReturnRequest from '../../models/ReturnRequest.js';
import Product from '../../models/Product.js';
import ProductVariation from '../../models/ProductVariation.js';
import StockTransaction from '../../models/StockTransaction.js';
import { StatusError } from '../../config/index.js';

export const createReplacement = async (requestId, adminId) => {
  const session = await mongoose.startSession();
  let request;
  try {
    await session.withTransaction(async () => {
      request = await ReturnRequest.findOneAndUpdate({ _id: requestId, status: 'replacement_pending', return_type: 'replacement' }, { $set: { updated_at: new Date() } }, { new: true, session });
      if (!request) throw StatusError.conflict('Return is not ready for replacement');
      if (request.replacement_order_id) return;
      const original = await Order.findById(request.order_id).session(session);
      const selected = request.items.filter((i) => i.accepted_quantity > 0);
      if (!selected.length || !request.inspected_at) throw StatusError.conflict('Replacement requires passed QC');
      const [replacement] = await Order.create([{
        id: `${request.request_number}-R`, original_order_id: original._id, replacement_return_id: request._id,
        user: original.user, shipping_address: original.shipping_address, billing_address: original.billing_address,
        shipping_address_snapshot: request.pickup_address_snapshot || original.shipping_address_snapshot,
        billing_address_snapshot: original.billing_address_snapshot,
        order_status: 'confirmed', payment_status: 'paid', payment_method: original.payment_method,
        total_amount: 0, grand_total: 0, total_items: selected.reduce((sum, i) => sum + i.accepted_quantity, 0),
        currency: original.currency, stock_reserved: true, note: `No-charge replacement for ${original.id} / ${request.request_number}`,
      }], { session });
      for (const item of selected) {
        const Model = item.variation_id ? ProductVariation : Product;
        const stock = await Model.updateOne({ _id: item.variation_id || item.product_id, status: { $ne: 'inactive' }, stock_quantity: { $gte: item.accepted_quantity } }, { $inc: { stock_quantity: -item.accepted_quantity } }, { session });
        if (stock.modifiedCount !== 1) throw StatusError.conflict('Replacement stock is unavailable. Retry when stock is available.');
        await StockTransaction.create([{ product: item.product_id, variation: item.variation_id, quantity: item.accepted_quantity,
          type: 'sale', reference_type: 'order', reference_id: replacement._id, created_by: adminId }], { session });
        await OrderItem.create([{ order_id: replacement._id, product_id: item.product_id, variation_id: item.variation_id,
          product_name: item.product_name, sku: item.sku, quantity: item.accepted_quantity,
          unit_price: 0, total_price: 0, regular_price: 0, currency: original.currency }], { session });
      }
      request.replacement_order_id = replacement._id;
      request.timeline.push({ event: 'replacement_created', label: 'Replacement Processing', status: request.status, actor_type: 'admin', actor_id: adminId });
      await request.save({ session });
    });
    return request;
  } finally { await session.endSession(); }
};

export const syncReplacement = async (order) => {
  if (!order?.replacement_return_id) return;
  const delivered = order.order_status === 'delivered';
  if (!delivered && !['shipped', 'out_for_delivery'].includes(order.order_status)) return;
  return ReturnRequest.findOneAndUpdate({ _id: order.replacement_return_id, status: { $in: delivered ? ['replacement_pending', 'replacement_shipped'] : ['replacement_pending'] } },
    { $set: { status: delivered ? 'completed' : 'replacement_shipped' }, $push: { timeline: {
      event: delivered ? 'replacement_delivered' : 'replacement_shipped', label: delivered ? 'Replacement Delivered — Completed' : 'Replacement Shipped',
      status: delivered ? 'completed' : 'replacement_shipped', actor_type: 'system', occurred_at: new Date(),
    } } }, { new: true });
};
