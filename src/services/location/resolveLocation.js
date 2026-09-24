import Country from '../../models/Country.js';
import State from '../../models/State.js';
import City from '../../models/City.js';

// WooCommerce's Indian state codes that differ from the catalog's iso2.
export const STATE_CODE_ALIASES = { IN: { DD: 'DH', DN: 'DH', OD: 'OR', TS: 'TG' } };

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactName = value => new RegExp(`^${escapeRegex(value)}$`, 'i');
const text = value => (value == null ? '' : String(value).trim());

// Catalog ids are numbers; anything else (ISO codes, names) is a legacy value.
export const numericId = (value) => {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  return typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : null;
};

// Resolves a country/state/city triple that may hold catalog ids, ISO/WooCommerce
// codes or plain names into catalog ids plus display names. A city missing from
// the catalog keeps its name with a null id, matching admin-entered addresses.
export const resolveLocation = async ({ country, state, city } = {}) => {
  const countryId = numericId(country);
  const countryInput = text(country).toUpperCase();
  const countryDoc = countryId ? await Country.findOne({ id: countryId }).lean()
    : countryInput ? await Country.findOne({ $or: [
      { iso2: countryInput }, { iso3: countryInput }, { name: exactName(text(country)) },
    ] }).lean() : null;
  if (!countryDoc) return null;

  const stateId = numericId(state);
  const stateInput = text(state).toUpperCase();
  const stateCode = STATE_CODE_ALIASES[countryDoc.iso2]?.[stateInput] || stateInput;
  const stateDoc = stateId ? await State.findOne({ id: stateId, country_id: countryDoc.id }).lean()
    : stateInput ? await State.findOne({ country_id: countryDoc.id, $or: [
      { iso2: stateCode }, { name: exactName(text(state)) },
    ] }).lean() : null;

  const cityId = numericId(city);
  const cityName = cityId ? null : text(city);
  const cityDoc = !stateDoc ? null : cityId
    ? await City.findOne({ id: cityId, state_id: stateDoc.id }).lean()
    : cityName ? await City.findOne({ state_id: stateDoc.id, name: exactName(cityName) }).lean() : null;

  return {
    country: countryDoc.id,
    country_name: countryDoc.name,
    state: stateDoc?.id ?? null,
    state_name: stateDoc?.name ?? null,
    city: cityDoc?.id ?? null,
    city_name: cityDoc?.name || cityName || null,
  };
};
