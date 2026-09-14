import { returnLabels } from './rules.js';
export const publicReturn = (request) => {
  const r = request.toObject ? request.toObject() : request;
  return { _id: r._id, order_id: r.order_id, order_number: r.order_number, request_number: r.request_number,
    return_type: r.return_type || 'refund', status: r.status, status_label: returnLabels[r.status] || 'In Progress',
    items: r.items, reason: r.reason, comment: r.comment, evidence: r.evidence,
    requested_at: r.requested_at, reviewed_at: r.reviewed_at, received_at: r.received_at, inspected_at: r.inspected_at,
    review_note: r.review_note, timeline: r.timeline, replacement_order_id: r.replacement_order_id,
    pickup: { status: r.pickup?.status, provider: r.pickup?.provider, tracking_number: r.pickup?.tracking_number,
      tracking_url: r.pickup?.tracking_url, expected_at: r.pickup?.expected_at },
    refund: { amount: r.refund?.amount, status: r.refund?.status, processed_at: r.refund?.processed_at } };
};
