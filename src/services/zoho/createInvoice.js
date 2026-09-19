import { booksRequest, zohoErrorMessage } from './booksRequest.js';
import moment from 'moment-timezone';

export const createInvoice = async (invoiceData) => {
  try {
    const payload = { ...invoiceData, date: invoiceData.date || moment().tz('Asia/Kolkata').format('YYYY-MM-DD') };
    const response = await booksRequest('POST', 'invoices', {
      params: invoiceData.invoice_number ? { ignore_auto_number_generation: true } : {}, data: payload,
    });
    return { success: true, data: response.invoice || response };
  } catch (error) {
    return { success: false, error: zohoErrorMessage(error) };
  }
};
