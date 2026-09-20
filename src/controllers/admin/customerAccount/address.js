import { assertCityName } from "../../../services/shipping/validateAddressCity.js";
import mongoose from 'mongoose';
import Address from '../../../models/Address.js';
import User from '../../../models/User.js';
import Country from '../../../models/Country.js';
import State from '../../../models/State.js';
import City from '../../../models/City.js';
import AuditLog from '../../../models/AuditLog.js';
import AddressResource from '../../../resources/AddressResource.js';
import { StatusError } from '../../../config/index.js';
import { assertPincodeServiceable } from '../../../services/shipping/assertPincodeServiceable.js';

const customerFilter = id => ({ _id: id, role: { $in: ['user', 'customer'] }, deleted_at: null });

export const listAddresses = async (req, res, next) => {
  try {
    if (!await User.exists(customerFilter(req.params.id))) throw StatusError.notFound('Customer not found');
    const addresses = await Address.find({ user: req.params.id, deleted_at: null }).sort({ is_default: -1, created_at: -1 }).lean();
    // Older addresses may only contain numeric location IDs.
    const countries = await Country.find({ id: { $in: addresses.map(a => a.country) } }).lean();
    const states = await State.find({ id: { $in: addresses.map(a => a.state).filter(Boolean) } }).lean();
    const cities = await City.find({ id: { $in: addresses.map(a => a.city).filter(Boolean) } }).lean();
    const data = addresses.map(address => new AddressResource({ ...address,
      country_name: address.country_name || countries.find(c => c.id === address.country)?.name,
      state_name: address.state_name || states.find(s => s.id === address.state)?.name,
      city_name: address.city_name || cities.find(c => c.id === address.city)?.name,
    }).exec());
    res.json({ status: 'success', data });
  } catch (error) { next(error); }
};

export const addressOptions = async (req, res, next) => {
  try {
    const countries = await Country.find({ status: 'active' }).select('id name phone_code').sort({ name: 1 }).lean();
    const states = req.query.country ? await State.find({ country_id: Number(req.query.country), status: 'active' })
      .select('id name').sort({ name: 1 }).lean() : [];
    res.json({ status: 'success', data: { countries, states } });
  } catch (error) { next(error); }
};

export const editAddress = async (req, res, next) => {
  let session;
  try {
    const { expected_updated_at, reason, ...fields } = req.body;
    const resolved = await resolveAddressFields(fields);
    session = await mongoose.startSession();
    let updated;
    await session.withTransaction(async () => {
      if (!await User.exists(customerFilter(req.params.id)).session(session)) throw StatusError.notFound('Customer not found');
      const original = await Address.findOne({ _id: req.params.addressId, user: req.params.id, deleted_at: null }).session(session).lean();
      if (!original) throw StatusError.notFound('Address not found. Refresh the address list.');
      if ((original.updated_at?.getTime() || null) !== (expected_updated_at ? new Date(expected_updated_at).getTime() : null)) {
        throw StatusError.conflict('Address changed. Refresh and review the latest details.');
      }
      const now = new Date();
      // Preserve every existing order's live address reference, including legacy
      // orders without snapshots. Only the address-book entry is superseded.
      const archived = await Address.updateOne({ _id: original._id, user: req.params.id, deleted_at: null,
        updated_at: original.updated_at || null }, { $set: { deleted_at: now, deleted_by: req.auth.user_id } }, { session });
      if (archived.modifiedCount !== 1) throw StatusError.conflict('Address changed. Refresh and try again.');
      const { _id, ...previous } = original;
      [updated] = await Address.create([{ ...previous, ...fields,
        ...resolved,
        latitude: null, longitude: null,
        updated_at: now, updated_by: req.auth.user_id,
        deleted_at: null, deleted_by: null,
      }], { session });
      await AuditLog.create([{
        user_id: req.params.id, actor_id: req.auth.user_id, event: 'CUSTOMER_ADDRESS_UPDATED',
        reason, ip: req.ip, user_agent: req.get('user-agent'),
        metadata: { previous_address_id: _id, address_id: updated._id,
          before: new AddressResource(original).exec(), after: new AddressResource(updated).exec() },
      }], { session });
    });
    res.json({ status: 'success', message: 'Customer address updated', data: new AddressResource(updated).exec() });
  } catch (error) { next(error); }
  finally { if (session) await session.endSession(); }
};

export const resolveAddressFields = async (fields) => {
    const cityName = assertCityName(fields.city_name);
    const country = await Country.findOne({ id: fields.country, status: 'active' }).lean();
    const state = await State.findOne({ id: fields.state, country_id: fields.country, status: 'active' }).lean();
    if (!country || !state) throw StatusError.badRequest('Select an active country and a state belonging to it');
    const callingCountries = await Country.find({ status: 'active' }).select('phone_code').lean();
    if (!callingCountries.some(c => String(c.phone_code || '').replace(/[^0-9]/g, '') === fields.phone_code)) {
      throw StatusError.badRequest('Select a calling code from an active country');
    }
    if (fields.purpose !== 'billing') await assertPincodeServiceable(fields.postcode, fields.country);
    const city = await City.findOne({ name: cityName, state_id: fields.state, country_id: fields.country, status: 'active' }).lean();
  return { country_name: country.name, state_name: state.name, city: city?.id || null, city_name: cityName };
};

export const createAddress = async (req, res, next) => {
  let session;
  try {
    const resolved = await resolveAddressFields(req.body);
    session = await mongoose.startSession();
    let address;
    await session.withTransaction(async () => {
      if (!await User.exists({ ...customerFilter(req.params.id), status: 'active' }).session(session)) {
        throw StatusError.notFound('Active customer not found');
      }
      [address] = await Address.create([{ ...req.body, ...resolved, user: req.params.id,
        created_by: req.auth.user_id, is_default: false,
      }], { session });
      await AuditLog.create([{
        user_id: req.params.id, actor_id: req.auth.user_id, event: 'CUSTOMER_ADDRESS_CREATED',
        ip: req.ip, user_agent: req.get('user-agent'),
        metadata: { address_id: address._id },
      }], { session });
    });
    res.status(201).json({ status: 'success', message: 'Customer address created', data: new AddressResource(address).exec() });
  } catch (error) { next(error); }
  finally { if (session) await session.endSession(); }
};
