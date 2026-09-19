import { booksRequest, zohoErrorMessage } from './booksRequest.js';

export const createCustomer = async (customerData, { recoverExisting = false } = {}) => {
  const findExisting = async () => {
    const response = await booksRequest('GET', 'contacts', { params: {
      contact_name: customerData.contact_name, contact_type: 'customer', per_page: 200,
    } });
    const matches = (response.contacts || []).filter(c => c.contact_name === customerData.contact_name && c.contact_type === 'customer');
    if (matches.length > 1) throw new Error('Multiple Zoho contacts match this customer. Reconcile the duplicate contacts before retrying.');
    if (matches[0]?.status === 'inactive') throw new Error('The linked Zoho contact is inactive. Activate it in Zoho Books before retrying.');
    return matches[0] || null;
  };
  try {
    if (recoverExisting) {
      const existing = await findExisting();
      if (existing) return { success: true, data: { contact: existing } };
    }
    try {
      const data = await booksRequest('POST', 'contacts', { data: customerData });
      if (!data.contact?.contact_id) throw new Error('Zoho Books did not return a customer ID');
      return { success: true, data };
    } catch (error) {
      if (recoverExisting) {
        const existing = await findExisting().catch(() => null);
        if (existing) return { success: true, data: { contact: existing } };
      }
      throw error;
    }
  } catch (error) {
    return { success: false, error: zohoErrorMessage(error) };
  }
};
