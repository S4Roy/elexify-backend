import { describe, it, expect, vi } from 'vitest';
import City from '../../models/City.js';
import { assertCityName, validateAddressCity } from './validateAddressCity.js';
import { addressEditSchema } from '../../validations/admin/customerAccount/address.js';

describe('address city validation', () => {
  it('accepts 40 characters and normalizes whitespace', () => {
    expect(assertCityName('A'.repeat(40))).toHaveLength(40);
    expect(assertCityName('  New   Delhi  ')).toBe('New Delhi');
  });
  it.each(['', '  ', 'A'.repeat(41)])('rejects invalid city %j', value => {
    expect(() => assertCityName(value)).toThrow();
  });
  it('enforces the boundary in the shared admin and order edit schema', () => {
    const schema = addressEditSchema.extract('city_name');
    expect(schema.validate('A'.repeat(40)).error).toBeUndefined();
    expect(schema.validate('A'.repeat(41)).error.message).toContain('40 characters');
  });
  it('checks resolved master names and the location hierarchy', async () => {
    const find = vi.spyOn(City, 'findOne').mockReturnValue({ lean: async () => ({ name: 'A'.repeat(41) }) });
    try {
      await expect(validateAddressCity(1, 2, 101)).rejects.toThrow('40 characters');
      expect(find).toHaveBeenCalledWith({ id: 1, state_id: 2, country_id: 101, status: 'active' });
      find.mockReturnValue({ lean: async () => null });
      await expect(validateAddressCity(1, 2, 101)).rejects.toThrow('Select a city');
      find.mockReturnValue({ lean: async () => ({ name: 'Delhi', state_name: 'Delhi', country_name: 'India' }) });
      await expect(validateAddressCity(1, 2, 101)).resolves.toEqual({ city_name: 'Delhi', state_name: 'Delhi', country_name: 'India' });
    } finally { find.mockRestore(); }
  });
});
