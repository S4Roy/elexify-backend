import { randomUUID } from 'node:crypto';
import ReturnRequest from '../../models/ReturnRequest.js';
import Order from '../../models/Order.js';
import Address from '../../models/Address.js';
import { envs, StatusError } from '../../config/index.js';
import { returnApi } from '../shiprocket/returnShipment.js';
import { getIntegrationConfig } from '../integrationCredentials/index.js';
import { sendReturnNotification } from '../notification/sendReturnNotification.js';
import { mapReverseStatus, canAdvancePickup, pickupLabels } from './rules.js';

export const applyReverseEvent = async ({ request, raw, at, awb, courier }) => {
  const status = mapReverseStatus(raw);
  const date = new Date(at);
  if (!Number.isFinite(date.getTime()) || !status || !canAdvancePickup(request.pickup?.status, status)) return request;
  const set = { 'pickup.status': status, 'pickup.raw_status': raw, 'pickup.provider_event_at': date,
    'pickup.updated_at': date, 'pickup.last_synced_at': new Date() };
  if (awb) { set['pickup.shiprocket_awb'] = String(awb); set['pickup.tracking_number'] = String(awb); }
  if (courier) set['pickup.provider'] = courier;
  if (status === 'delivered') { set.status = 'received'; set.received_at = date; }
  if (status === 'scheduled') set['pickup.scheduled_at'] = date;
  if (status === 'scheduled' && request.pickup?.scheduled_at) delete set['pickup.scheduled_at'];
  const updated = await ReturnRequest.findOneAndUpdate({ _id: request._id, status: 'approved', 'pickup.status': request.pickup.status,
    $or: [{ 'pickup.provider_event_at': null }, { 'pickup.provider_event_at': { $lt: date } }] },
    { $set: set, $push: { timeline: { event: `pickup_${status}`, label: pickupLabels[status], status, occurred_at: date, actor_type: 'carrier' } } }, { new: true });
  if (updated) await sendReturnNotification({ request: updated, event: status === 'delivered' ? 'RETURN_RECEIVED' : 'RETURN_UPDATED' });
  return updated || request;
};

const addressFields = (prefix, address) => ({
  [`${prefix}_customer_name`]: address.full_name, [`${prefix}_last_name`]: '',
  [`${prefix}_address`]: address.address_line_1, [`${prefix}_address_2`]: address.address_line_2 || '',
  [`${prefix}_city`]: address.city, [`${prefix}_state`]: address.state,
  [`${prefix}_country`]: address.country, [`${prefix}_pincode`]: address.postcode,
  [`${prefix}_email`]: address.email || '', [`${prefix}_phone`]: address.phone,
});

export const bookReversePickup = async ({ requestId, adminId, parcel, warehouse, external_order_id }) => {
  const token = randomUUID();
  const request = await ReturnRequest.findOneAndUpdate({ _id: requestId, status: 'approved', $or: [{ 'pickup.operation_token': null }, { 'pickup.last_attempt_at': { $lt: new Date(Date.now() - 120000) } }] },
    { $set: { 'pickup.operation_token': token, 'pickup.last_attempt_at': new Date() }, $inc: { 'pickup.attempt_count': 1 } }, { new: true });
  if (!request) throw StatusError.conflict('Pickup is already being processed or return is not approved');
  let mutationStarted = false;
  try {
    if (request.pickup.status !== 'not_scheduled' && request.pickup.integration_status === 'created') return request;
    if (['unknown', 'pending'].includes(request.pickup.integration_status) && request.pickup.shiprocket_awb) throw StatusError.conflict('AWB is already assigned. Refresh tracking or confirm the existing pickup manually; do not schedule it again.');
    if (external_order_id) {
      const remote = (await returnApi('GET', `orders/show/${encodeURIComponent(external_order_id)}`)).data;
      if (String(remote?.channel_order_id) !== request.request_number) throw StatusError.badRequest('Shiprocket order does not belong to this return');
      const shipment = Array.isArray(remote.shipments) ? remote.shipments[0] : remote.shipments;
      if (!shipment?.id) throw StatusError.badRequest('Shiprocket shipment is not available');
      request.pickup.shiprocket_order_id = String(remote.id);
      request.pickup.shiprocket_shipment_id = String(shipment.id);
      request.pickup.shiprocket_awb = shipment.awb || null;
      request.pickup.integration_status = 'created';
      await request.save();
    }
    if (request.pickup.integration_status === 'unknown' || request.pickup.integration_status === 'pending') throw StatusError.conflict('Previous booking needs reconciliation in Shiprocket. Supply its existing return order ID; do not create another.');
    if (!request.pickup.shiprocket_shipment_id) {
      const config = await getIntegrationConfig('shiprocket', { channel_id: envs.shiprocket?.channel_id });
      if (!config) throw StatusError.badRequest('Shiprocket is disabled');
      const locations = await returnApi('GET', 'settings/company/pickup');
      const destination = locations.data?.shipping_address?.find((p) => p.pickup_location === (warehouse || process.env.RETURN_WAREHOUSE || envs.PROJECT_NAME));
      if (!destination) throw StatusError.badRequest('Select an existing Shiprocket warehouse pickup location');
      const order = await Order.findById(request.order_id);
      const pickup = { ...(request.pickup_address_snapshot || {}) };
      if (!pickup.city || !pickup.state || !pickup.country) {
        const live = await Address.findById(order.shipping_address).populate('city state country');
        pickup.city ||= live?.city_name || live?.city?.name;
        pickup.state ||= live?.state_name || live?.state?.name;
        pickup.country ||= live?.country_name || live?.country?.name;
      }
      const drop = { full_name: destination.name || destination.pickup_location, address_line_1: destination.address,
        address_line_2: destination.address_2, city: destination.city, state: destination.state, country: destination.country,
        postcode: destination.pin_code, email: destination.email, phone: destination.phone };
      for (const address of [pickup, drop]) if (['full_name','address_line_1','city','state','country','postcode','phone'].some((key) => !address[key])) throw StatusError.badRequest('Complete pickup and warehouse addresses are required');
      if (!parcel || ['length','breadth','height','weight'].some((key) => !(Number(parcel[key]) > 0))) throw StatusError.badRequest('Enter parcel weight and dimensions');
      const payload = { order_id: request.request_number, order_date: new Date().toISOString().slice(0,10),
        ...(config.channel_id && { channel_id: config.channel_id }), ...addressFields('pickup', pickup), ...addressFields('shipping', drop),
        order_items: request.items.map((i) => ({ name: i.product_name, sku: i.sku || String(i.product_id), units: i.quantity, selling_price: i.unit_price, discount: 0, qc_enable: false })),
        payment_method: 'PREPAID', total_discount: 0, sub_total: request.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0),
        ...parcel };
      request.pickup.booking_snapshot = payload;
      request.pickup.integration_status = 'pending';
      await request.save();
      mutationStarted = true;
      const created = await returnApi('POST', 'orders/create/return', payload);
      const data = created.data || created;
      if (!data.order_id || !data.shipment_id) throw new Error('Shiprocket did not return order and shipment references');
      request.pickup.shiprocket_order_id = String(data.order_id);
      request.pickup.shiprocket_shipment_id = String(data.shipment_id);
      request.pickup.integration_status = 'created';
      await request.save();
    }
    if (!request.pickup.shiprocket_awb) {
      request.pickup.integration_status = 'pending';
      await request.save();
      mutationStarted = true;
      const assigned = await returnApi('POST', 'courier/assign/awb', { shipment_id: Number(request.pickup.shiprocket_shipment_id), is_return: 1 });
      const awb = assigned.response?.data || assigned.data;
      if (!awb?.awb_code) throw new Error('No reverse courier/AWB was assigned');
      request.pickup.shiprocket_awb = String(awb.awb_code);
      request.pickup.tracking_number = String(awb.awb_code);
      request.pickup.provider = awb.courier_name || 'Shiprocket';
      request.pickup.integration_status = 'created';
      await request.save();
    }
    request.pickup.integration_status = 'pending';
    await request.save();
    mutationStarted = true;
    const pickup = await returnApi('POST', 'courier/generate/pickup', { shipment_id: [Number(request.pickup.shiprocket_shipment_id)] });
    if (Number(pickup.pickup_status) !== 1) throw new Error('Shiprocket has not confirmed pickup scheduling');
    const updated = await ReturnRequest.findOneAndUpdate({ _id: request._id, status: 'approved', 'pickup.status': 'not_scheduled', 'pickup.operation_token': token }, {
      $set: { 'pickup.status': 'scheduled', 'pickup.scheduled_at': new Date(), 'pickup.integration_status': 'created', 'pickup.last_error': null },
      $push: { timeline: { event: 'pickup_scheduled', label: 'Pickup Scheduled', status: 'scheduled', actor_type: 'admin', actor_id: adminId } },
    }, { new: true });
    if (updated) await sendReturnNotification({ request: updated, event: 'RETURN_UPDATED' });
    return updated || ReturnRequest.findById(request._id);
  } catch (error) {
    await ReturnRequest.updateOne({ _id: request._id, 'pickup.operation_token': token }, { $set: {
      'pickup.integration_status': mutationStarted ? 'unknown' : request.pickup.integration_status === 'pending' ? 'unknown' : request.pickup.integration_status,
      'pickup.last_error': mutationStarted ? 'Booking response is uncertain. Reconcile the existing Shiprocket return before retrying.' : String(error.message).slice(0,500),
    }, $push: { timeline: { event: 'pickup_attempt_failed', label: 'Pickup Arrangement Delayed', actor_type: 'admin', actor_id: adminId } } });
    throw StatusError.badRequest(mutationStarted ? 'Pickup response is uncertain; reconcile in Shiprocket before retrying.' : error.message);
  } finally { await ReturnRequest.updateOne({ _id: request._id, 'pickup.operation_token': token }, { $set: { 'pickup.operation_token': null } }); }
};

export const reconcileReversePickup = async (requestId) => {
  const request = await ReturnRequest.findById(requestId);
  if (!request?.pickup?.shiprocket_shipment_id) throw StatusError.badRequest('No reverse shipment reference is available');
  const data = await returnApi('GET', `courier/track/shipment/${encodeURIComponent(request.pickup.shiprocket_shipment_id)}`);
  const tracking = data.tracking_data;
  const latest = tracking?.shipment_track_activities?.[0];
  const shipment = tracking?.shipment_track?.[0];
  if (tracking?.track_url?.startsWith('https://')) await ReturnRequest.updateOne({ _id: request._id }, { $set: { 'pickup.tracking_url': tracking.track_url } });
  return applyReverseEvent({ request, raw: latest?.['sr-status-label'] || latest?.activity || shipment?.current_status,
    at: latest?.date || new Date(), awb: shipment?.awb_code, courier: shipment?.courier_name });
};
