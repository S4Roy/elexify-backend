import City from '../../models/City.js';
import State from '../../models/State.js';
import Country from '../../models/Country.js';

// Addresses may contain numeric catalog IDs instead of populated locations.
export const resolveCustomerAddress = async (address = {}) => {
  const result = { ...address };
  for (const [field, model] of [['city', City], ['state', State], ['country', Country]]) {
    const value = address[field];
    const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value));
    const record = numeric ? await model.findOne({ id: Number(value) }).lean() :
      value && typeof value === 'object' ? value : null;
    if (record?.name) result[field] = record.name;
    else if (numeric) result[field] = address[`${field}_name`] || '';
    if (field === 'state' && record) {
      result.state_code = record.iso2 || record.iso3166_2?.split('-').pop();
      result.country_name ||= record.country_name;
      result.country_code ||= record.country_code;
    }
    if (field === 'country' && record) result.country_code = record.iso2;
  }
  if (!result.state_code) {
    const name = result.state_name || (typeof result.state === 'string' ? result.state : result.state?.name);
    if (name) {
      const state = await State.findOne({ name, country_code: result.country_code || 'IN' }).lean();
      if (state) {
        result.state_code = state.iso2 || state.iso3166_2?.split('-').pop();
        result.country_code ||= state.country_code;
        result.country_name ||= state.country_name;
      }
    }
  }
  return result;
};
