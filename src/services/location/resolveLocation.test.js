import { describe, it, expect, vi, afterEach } from 'vitest';
import Country from '../../models/Country.js';
import State from '../../models/State.js';
import City from '../../models/City.js';
import { numericId, resolveLocation } from './resolveLocation.js';

const lean = value => ({ lean: async () => value });
const india = { id: 101, iso2: 'IN', name: 'India' };

describe('resolveLocation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('only treats positive integers as catalog ids', () => {
    expect(numericId(101)).toBe(101);
    expect(numericId('4853')).toBe(4853);
    expect([numericId('IN'), numericId(null), numericId(0), numericId(1.5)]).toEqual([null, null, null, null]);
  });

  it('maps legacy WooCommerce codes and city names to catalog ids', async () => {
    const country = vi.spyOn(Country, 'findOne').mockReturnValue(lean(india));
    const state = vi.spyOn(State, 'findOne').mockReturnValue(lean({ id: 4853, name: 'West Bengal' }));
    const city = vi.spyOn(City, 'findOne').mockReturnValue(lean({ id: 141899, name: 'Birpara' }));
    await expect(resolveLocation({ country: 'IN', state: 'WB', city: 'birpara' })).resolves.toEqual({
      country: 101, country_name: 'India', state: 4853, state_name: 'West Bengal', city: 141899, city_name: 'Birpara',
    });
    expect(country.mock.calls[0][0].$or[0]).toEqual({ iso2: 'IN' });
    expect(state.mock.calls[0][0]).toMatchObject({ country_id: 101 });
    expect(state.mock.calls[0][0].$or[0]).toEqual({ iso2: 'WB' });
    expect(city.mock.calls[0][0]).toMatchObject({ state_id: 4853 });
  });

  it('translates WooCommerce state codes that differ from the catalog', async () => {
    vi.spyOn(Country, 'findOne').mockReturnValue(lean(india));
    const state = vi.spyOn(State, 'findOne').mockReturnValue(lean({ id: 4012, name: 'Telangana' }));
    vi.spyOn(City, 'findOne').mockReturnValue(lean(null));
    const result = await resolveLocation({ country: 'IN', state: 'TS', city: 'Unlisted Town' });
    expect(state.mock.calls[0][0].$or[0]).toEqual({ iso2: 'TG' });
    expect(result).toMatchObject({ state: 4012, city: null, city_name: 'Unlisted Town' });
  });

  it('looks numeric ids up by id and returns null for an unknown country', async () => {
    const country = vi.spyOn(Country, 'findOne').mockReturnValue(lean(null));
    await expect(resolveLocation({ country: 999, state: 1 })).resolves.toBeNull();
    expect(country).toHaveBeenCalledWith({ id: 999 });
  });
});
