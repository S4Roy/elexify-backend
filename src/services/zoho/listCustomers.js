import { booksRequest } from './booksRequest.js';

export const listCustomers = async () => booksRequest('GET', 'contacts', { params: { contact_type: 'customer' } });
