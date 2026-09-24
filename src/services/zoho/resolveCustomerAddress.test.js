import { describe, it, expect, vi, afterEach } from 'vitest';
import City from '../../models/City.js';
import State from '../../models/State.js';
import Country from '../../models/Country.js';
import { resolveCustomerAddress } from './resolveCustomerAddress.js';

const lean = value => ({ lean: async () => value });

describe('resolveCustomerAddress', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([['TG', 'Telangana', 'TS'], ['CT', 'Chhattisgarh', 'CG'], ['OR', 'Odisha', 'OD'], ['WB', 'West Bengal', 'WB']])(
    'sends Zoho the GST state code for %s', async (iso2, name, expected) => {
      vi.spyOn(City, 'findOne').mockReturnValue(lean(null));
      vi.spyOn(State, 'findOne').mockReturnValue(lean({ id: 1, iso2, name, country_code: 'IN', country_name: 'India' }));
      vi.spyOn(Country, 'findOne').mockReturnValue(lean({ id: 101, iso2: 'IN', name: 'India' }));
      await expect(resolveCustomerAddress({ state: 1, country: 101 })).resolves.toMatchObject({ state: name, state_code: expected });
    });

  it('maps snapshot state names the same way', async () => {
    vi.spyOn(State, 'findOne').mockReturnValue(lean({ iso2: 'TG', name: 'Telangana', country_code: 'IN', country_name: 'India' }));
    await expect(resolveCustomerAddress({ state: 'Telangana', country: 'India' })).resolves.toMatchObject({ state_code: 'TS' });
  });
});
