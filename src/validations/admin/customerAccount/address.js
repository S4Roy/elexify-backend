import { englishAddressLine } from "../../englishAddressLine.js";
import { celebrate, Joi } from 'celebrate';

export const addressParams = Joi.object({
  id: Joi.string().hex().length(24).required(),
  addressId: Joi.string().hex().length(24),
});

export const addressEditSchema = Joi.object({
  expected_updated_at: Joi.date().iso().allow(null).required(),
  full_name: Joi.string().trim().min(2).max(100).required(),
  phone_code: Joi.string().pattern(/^\d{1,4}$/).required(),
  phone: Joi.string().pattern(/^\d{6,14}$/).required(),
  email: Joi.string().trim().email().max(254).allow('').required(),
  address_line_1: englishAddressLine().trim().min(5).max(200).required(),
  address_line_2: englishAddressLine().trim().max(200).allow('').required(),
  land_mark: Joi.string().trim().max(100).allow('').required(),
  country: Joi.number().integer().positive().required(),
  state: Joi.number().integer().positive().required(),
  city_name: Joi.string().trim().min(1).max(100).required(),
  postcode: Joi.string().trim().min(2).max(20).required(),
  address_type: Joi.string().valid('home', 'office', 'billing', 'shipping', 'other').required(),
  purpose: Joi.string().valid('shipping', 'billing', 'both').required(),
  reason: Joi.string().trim().min(10).max(500).required(),
}).custom((value, helpers) => {
  if (value.country === 101 && !/^[1-9]\d{5}$/.test(value.postcode)) return helpers.message('Enter a valid six-digit Indian pincode');
  if (value.phone_code === '91' && !/^[6-9]\d{9}$/.test(value.phone)) return helpers.message('Enter a valid Indian mobile number');
  return value;
});

export const validateAddressList = celebrate({ params: addressParams });
export const validateAddressOptions = celebrate({
  params: addressParams,
  query: Joi.object({ country: Joi.number().integer().positive() }),
});
export const validateAddressEdit = celebrate({
  params: addressParams.keys({ addressId: Joi.string().hex().length(24).required() }),
  body: addressEditSchema,
});

export const addressCreateSchema = addressEditSchema.keys({ expected_updated_at: Joi.forbidden(), reason: Joi.forbidden() });
export const validateAddressCreate = celebrate({ params: addressParams, body: addressCreateSchema });
