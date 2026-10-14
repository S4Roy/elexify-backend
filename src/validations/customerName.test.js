import { describe, it, expect } from 'vitest';
import { customerName, isEnglishCustomerName } from './customerName.js';
import { edit } from './user/account/edit.js';
import { verifyOtp } from './auth/login/verifyOtp.js';
import { addressEditSchema } from './admin/customerAccount/address.js';

const run = (middleware, body) => new Promise(resolve => {
  middleware({ method: 'POST', body, params: {}, query: {}, headers: {} }, {}, resolve);
});

describe('English customer names', () => {
  it.each(['Asha Roy', "O'Connor", 'Anne-Marie', 'J. Smith', 'Li'])('accepts %s', name => {
    expect(customerName().validate(name).error).toBeUndefined();
    expect(isEnglishCustomerName(name)).toBe(true);
  });
  it.each(['রাহুল', 'राहुल', 'José', 'Asha123', 'Jane🙂', "John\nSmith", '---', '   '])('rejects %s', name => {
    expect(customerName().validate(name).error).toBeDefined();
    expect(isEnglishCustomerName(name)).toBe(false);
  });
  it('normalizes surrounding spaces without transliterating', () => {
    expect(customerName().validate('  Asha Roy  ').value).toBe('Asha Roy');
  });
  it('allows correcting or clearing a last name but rejects non-English profile fields', async () => {
    expect(await run(edit, { first_name: 'Asha', last_name: '' })).toBeFalsy();
    expect(await run(edit, { last_name: 'রায়' })).toBeTruthy();
    expect(await run(edit, { profile_image: 'https://example.com/avatar.png' })).toBeFalsy();
  });
  it('allows existing-user OTP login without name fields and rejects invalid submitted names', async () => {
    const login = { mobile: '9876543210', otp: '123456' };
    expect(await run(verifyOtp, login)).toBeFalsy();
    expect(await run(verifyOtp, { ...login, first_name: 'राहुल' })).toBeTruthy();
  });
  it('enforces recipient names in admin address schemas', () => {
    expect(addressEditSchema.extract('full_name').validate('রাহুল').error).toBeDefined();
  });
});
