import { describe, expect, it } from 'vitest';
import { englishAddressLine, ENGLISH_ADDRESS_MESSAGE } from './englishAddressLine.js';

describe('English address lines', () => {
  it.each([
    '123 Main Street', "Flat #4/B, O'Brien Road", 'C/O Smith & Sons (Block-A)',
    'Floor 2: Building + Annex', '12.5 North Road',
  ])('accepts %s', address => {
    expect(englishAddressLine().validate(address).error).toBeUndefined();
  });

  it.each([
    '১২ রাস্তা', '१२ सड़क', '12 路', '12 شارع', '12 Rue École',
    '12 Road 🏠', '12 Road\n', '12\tRoad', '12\u200bRoad', '<script>road</script>',
  ])('rejects unsupported characters in %s', address => {
    const { error } = englishAddressLine().validate(address);
    expect(error?.message).toBe(ENGLISH_ADDRESS_MESSAGE);
  });

  it('preserves optional second address lines', () => {
    const schema = englishAddressLine().optional().allow(null, '');
    for (const value of [undefined, null, '']) expect(schema.validate(value).error).toBeUndefined();
  });
  it('still enforces required fields and length', () => {
    const schema = englishAddressLine().min(5).max(200).required();
    for (const value of [undefined, '', '123', 'a'.repeat(201)]) expect(schema.validate(value).error).toBeDefined();
  });
});
