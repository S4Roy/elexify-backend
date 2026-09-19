import { Joi } from 'celebrate';

// Latin A-Z text with numbers and common address punctuation. Reject rather
// than transliterate so a delivery address is never silently changed.
export const NON_ENGLISH_ADDRESS_CHARACTER = /[^A-Za-z0-9 .,\/#&()'":+\-]/;
export const ENGLISH_ADDRESS_MESSAGE = 'Address lines must use English letters (A-Z), numbers, spaces and common punctuation only';
export const englishAddressLine = () => Joi.string()
  .pattern(NON_ENGLISH_ADDRESS_CHARACTER, { invert: true })
  .messages({ 'string.pattern.invert.base': ENGLISH_ADDRESS_MESSAGE });
