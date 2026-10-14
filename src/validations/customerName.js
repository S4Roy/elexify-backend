import { Joi } from 'celebrate';

export const CUSTOMER_NAME_PATTERN = /^(?=.*[A-Za-z])[A-Za-z .'-]+$/;
export const CUSTOMER_NAME_MESSAGE = "Use English letters (A-Z), spaces, apostrophes, hyphens and periods only";
export const isEnglishCustomerName = (value) => typeof value === 'string' && CUSTOMER_NAME_PATTERN.test(value.trim());
export const customerName = () => Joi.string().trim().pattern(CUSTOMER_NAME_PATTERN)
  .messages({ 'string.pattern.base': CUSTOMER_NAME_MESSAGE });
