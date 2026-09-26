import { listSessions, securityEvents, revoke } from '../../controllers/admin/customerAccount/sessions.js';
import { listAddresses, editAddress, createAddress, addressOptions } from "../../controllers/admin/customerAccount/address.js";
import { validateAddressList, validateAddressEdit, validateAddressCreate, validateAddressOptions } from "../../validations/admin/customerAccount/address.js";
import { Router } from "express";
import { customerAccountController } from "../../controllers/admin/index.js";
import { customerAccountValidation } from "../../validations/admin/index.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { PERMISSIONS } from "../../constants/adminPermissions.js";

// Phase 2 additions — deliberately mounted at /admin/customers (plural),
// separate from the existing /admin/customer (singular) CRUD router in
// ./customer.js, to avoid touching that already-working list/add/edit/
// remove/change-status surface.
const customersRouter = Router();

customersRouter.post('/:id/addresses', requirePermission(PERMISSIONS.CUSTOMER_ADDRESS_MANAGE), validateAddressCreate, createAddress);
customersRouter.get('/:id/addresses', requirePermission(PERMISSIONS.CUSTOMER_CONTACT_VIEW), validateAddressList, listAddresses);
customersRouter.get('/:id/address-options', requirePermission(PERMISSIONS.CUSTOMER_ADDRESS_MANAGE), validateAddressOptions, addressOptions);
customersRouter.put('/:id/addresses/:addressId', requirePermission(PERMISSIONS.CUSTOMER_ADDRESS_MANAGE), validateAddressEdit, editAddress);

customersRouter.get(
  "/:id/details",
  requirePermission(PERMISSIONS.CUSTOMER_VIEW),
  customerAccountController.details
);

customersRouter.get(
  "/:id/notification-preferences",
  requirePermission(PERMISSIONS.CUSTOMER_NOTIFICATION_VIEW),
  customerAccountController.getNotificationPreferences
);

customersRouter.patch(
  "/:id/notification-preferences",
  requirePermission(PERMISSIONS.CUSTOMER_PREFERENCE_MANAGE),
  customerAccountValidation.updateNotificationPreferences,
  customerAccountController.updateNotificationPreferences
);

customersRouter.post(
  "/:id/verification-override",
  requirePermission(PERMISSIONS.CUSTOMER_VERIFICATION_OVERRIDE),
  customerAccountValidation.verificationOverride,
  customerAccountController.verificationOverride
);

customersRouter.get('/:id/sessions', requirePermission(PERMISSIONS.CUSTOMER_VIEW), listSessions);
customersRouter.get('/:id/auth-events', requirePermission(PERMISSIONS.AUDIT_LOG_VIEW), securityEvents);
customersRouter.post('/:id/logout-all', requirePermission('customers.update'), revoke);
customersRouter.delete('/:id/sessions/:sessionId', requirePermission('customers.update'), revoke);
export { customersRouter };
