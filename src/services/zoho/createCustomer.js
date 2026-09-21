import { booksRequest, zohoErrorMessage } from './booksRequest.js';
import ZohoConnection from '../../models/ZohoConnection.js';
import { syncMapped } from './ZohoMappingService.js';
import { findContact } from './ZohoContactService.js';
import { booksClient, ZohoError } from './ZohoBooksClient.js';

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
    const connection = await ZohoConnection.findOne({ key: 'books', connected: true });
    if (connection?.organization_id) {
      const contact = await syncMapped({ connection, kind: 'contact',
        identity: customerData.notes?.match(/ — Elexify customer (.+)$/)?.[1] || customerData.contact_name.replace(/^Elexify /, ''), path: 'contacts', singular: 'contact', payload: customerData,
        lookup: () => findContact(connection, customerData),
        beforeUpdate: async remoteId => {
          const existing = (await booksClient(connection, 'GET', `contacts/${remoteId}`)).contact;
          if (!existing || existing.status === 'inactive') throw new ZohoError('CONTACT_INACTIVE_REVIEW_REQUIRED');
          customerData.contact_name = existing.contact_name;
          const primary = existing.contact_persons?.find(person => person.is_primary_contact);
          if (primary && customerData.contact_persons?.[0]) customerData.contact_persons[0].contact_person_id = primary.contact_person_id;
        },
      });
      return { success: true, data: { contact } };
    }
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
