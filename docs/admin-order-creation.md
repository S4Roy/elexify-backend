# Admin order creation

Superadmins and managers can use **Orders → Create order**. Other admin roles cannot access the creation, quotation, or lookup endpoints.

Select an existing active customer and saved delivery address, add catalogue products or variations and quantities, select COD or online payment, and review the calculated total before creating. Customer profiles remain the place to add customers and addresses. This flow currently uses INR and the delivery address for billing as well.

The admin endpoint reuses storefront checkout for authoritative prices, quantity discounts, shipping, GST snapshots, COD eligibility/fees/advance requirements, payment provider setup, transactional writes and stock reservation. It never modifies the customer's cart. The server requires the reviewed total and rejects price changes. Order source and creating admin are stored on the order. A namespaced idempotency key and request fingerprint protect identical submission retries.

Online and advance-COD orders await verified payment; creation does not mark them paid. Customers use the existing order-page payment action within the one-hour payment window. Full COD confirmation follows the existing store settings and notification flow. Manual receipts can subsequently be recorded through the existing permission-controlled payment action.

Deploy the backend and admin panel together. No permission seeder is necessary because roles use the existing static permission map. Test against a staging MongoDB replica set and payment sandbox before deployment; unit checks do not exercise external services or real transactions.
