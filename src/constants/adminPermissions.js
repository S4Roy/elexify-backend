// Existing permission keys are retained for API compatibility.
// ROLE_PERMISSIONS below is migration seed data only; runtime guards resolve
// Role.permissions from MongoDB and never authorize by these labels.

export const PERMISSIONS = {
  CUSTOMER_ADDRESS_MANAGE: "customer.address.manage",
  CUSTOMER_VIEW: "customer.view",
  CUSTOMER_CONTACT_VIEW: "customer.contact.view",
  CUSTOMER_VERIFICATION_OVERRIDE: "customer.verification.override",
  CUSTOMER_NOTIFICATION_VIEW: "customer.notification.view",
  CUSTOMER_NOTIFICATION_RETRY: "customer.notification.retry",
  CUSTOMER_PREFERENCE_MANAGE: "customer.preference.manage",
  // Email-template design/content management (list/edit/preview/send-test/
  // reset-to-default) — same superadmin+manager-only shape as the other
  // sensitive admin capabilities above.
  EMAIL_TEMPLATE_MANAGE: "email_template.manage",
  // Same shape as EMAIL_TEMPLATE_MANAGE, for the DLT-approved SMS
  // template set (models/SmsTemplate.js).
  SMS_TEMPLATE_MANAGE: "sms_template.manage",
  INTEGRATION_CREDENTIAL_MANAGE: "integration_credential.manage",
  ZOHO_INVOICE_MANAGE: "zoho_invoice.manage",
  ZOHO_SYNC_MANAGE: "zoho_sync.manage",
  ZOHO_SYNC_VIEW: "zoho_sync.view",
  RETURN_VIEW: "return.view",
  RETURN_REVIEW: "return.review",
  ORDER_CREATE: "order.create",
  ORDER_ADDRESS_MANAGE: "order.address.manage",
  ORDER_PAYMENT_MANAGE: "order.payment.manage",
  ORDER_STATUS_MANAGE: "order.status.manage",
  ORDER_CANCEL_MANAGE: "order.cancel.manage",
  // Bypasses the normal cancellation eligibility rules (configured status
  // list, packed-order courier check) — deliberately not granted to manager,
  // only superadmin. See services/orderService/cancelOrder.js `force` path.
  ORDER_FORCE_CANCEL: "order.force_cancel.manage",
  // Undoes a cancellation back to "processing" — refused outright if a
  // refund already went through or is in flight. See
  // services/orderService/reopenOrder.js.
  ORDER_REOPEN_MANAGE: "order.reopen.manage",

  // Centralized Data Operations (seeders/migrations/backfills/repairs) —
  // see routes/admin/dataOperations.js and scripts/runner.js. View
  // permissions are per operation-type so a role can be given visibility
  // into, say, seeders without also seeing migrations; execute permissions
  // are separate and deliberately not granted to any non-superadmin role
  // by default (data-mutating, some CRITICAL-risk).
  DATA_VIEW: "system.data.view",
  SEEDER_VIEW: "system.seeder.view",
  SEEDER_EXECUTE: "system.seeder.execute",
  MIGRATION_VIEW: "system.migration.view",
  MIGRATION_EXECUTE: "system.migration.execute",
  REPAIR_VIEW: "system.repair.view",
  REPAIR_EXECUTE: "system.repair.execute",
  OPERATION_HISTORY_VIEW: "system.operation.history.view",

  // Admin-facing view of the append-only audit trail (models/AuditLog.js) —
  // RBAC changes, customer/order edits, verification overrides, data
  // operations, etc. Deliberately separate from the individual domain
  // permissions above: viewing the audit trail is a broader, more sensitive
  // capability than viewing the records it describes.
  AUDIT_LOG_VIEW: "audit_log.view",
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const VIEW_ONLY = [
  PERMISSIONS.CUSTOMER_VIEW,
  PERMISSIONS.CUSTOMER_CONTACT_VIEW,
  PERMISSIONS.CUSTOMER_NOTIFICATION_VIEW,
];

const DATA_OPERATIONS_VIEW_ONLY = [
  PERMISSIONS.DATA_VIEW,
  PERMISSIONS.SEEDER_VIEW,
  PERMISSIONS.MIGRATION_VIEW,
  PERMISSIONS.REPAIR_VIEW,
  PERMISSIONS.OPERATION_HISTORY_VIEW,
];

export const ROLE_PERMISSIONS = {
  superadmin: ALL_PERMISSIONS,
  manager: [
    ...VIEW_ONLY,
    PERMISSIONS.CUSTOMER_VERIFICATION_OVERRIDE,
    PERMISSIONS.CUSTOMER_ADDRESS_MANAGE,
    PERMISSIONS.CUSTOMER_NOTIFICATION_RETRY,
    PERMISSIONS.CUSTOMER_PREFERENCE_MANAGE,
    PERMISSIONS.EMAIL_TEMPLATE_MANAGE,
    PERMISSIONS.SMS_TEMPLATE_MANAGE,
    PERMISSIONS.ZOHO_INVOICE_MANAGE,
    PERMISSIONS.ZOHO_SYNC_MANAGE,
    PERMISSIONS.ZOHO_SYNC_VIEW,
    PERMISSIONS.RETURN_VIEW,
    PERMISSIONS.RETURN_REVIEW,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_STATUS_MANAGE,
    PERMISSIONS.ORDER_PAYMENT_MANAGE,
    PERMISSIONS.ORDER_ADDRESS_MANAGE,
    PERMISSIONS.ORDER_CANCEL_MANAGE,
    PERMISSIONS.ORDER_REOPEN_MANAGE,
    // View-only for Data Operations — no execute permissions, matching the
    // existing "view-only for non-superadmin" pattern used elsewhere in
    // this file. Adjustable later if a manager role needs to run LOW-risk
    // seeders themselves.
    ...DATA_OPERATIONS_VIEW_ONLY,
    PERMISSIONS.AUDIT_LOG_VIEW,
  ],
  supervisor: [...VIEW_ONLY, PERMISSIONS.RETURN_VIEW],
  staff: VIEW_ONLY,
  operator: VIEW_ONLY,
};

export const roleHasPermission = (role, permission) =>
  (ROLE_PERMISSIONS[role] || []).includes(permission);
