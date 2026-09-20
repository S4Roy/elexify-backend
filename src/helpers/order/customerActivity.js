// Only aggregate the customers on the requested page; guest and deleted orders
// never contribute to another customer's activity.
export function customerActivityPipeline(ids) {
  return [
    { $match: { user: { $in: ids }, deleted_at: null } },
    { $group: { _id: '$user', order_count: { $sum: 1 }, last_order_at: { $max: '$created_at' } } },
  ];
}
