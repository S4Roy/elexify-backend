// Shared correlation keys for carrier webhooks and admin file reconciliation.
export const packageReferenceQuery = ({ orderIds = [], awb = null, shipmentId = null }) => ({
  $or: [
    ...orderIds.flatMap(id => [{ shiprocket_order_id: id }, { reference_id: id }]),
    ...(awb ? [{ awb }] : []),
    ...(shipmentId ? [{ shiprocket_shipment_id: String(shipmentId) }] : []),
  ],
});
export const orderReferenceQuery = ({ orderIds = [], awb = null }) => ({
  $or: [
    ...orderIds.flatMap(id => [{ id }, { shiprocket_order_id: id }]),
    ...(awb ? [{ awb }] : []),
  ],
});
