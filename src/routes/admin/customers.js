import { listAddresses, editAddress, addressOptions } from "../../controllers/admin/customerAccount/address.js";
import { validateAddressList, validateAddressEdit, validateAddressOptions } from "../../validations/admin/customerAccount/address.js";
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

export { customersRouter };
