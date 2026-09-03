// Minimal, additive RBAC layer for the Phase 2 customer/notification admin
// endpoints. No granular permission system exists elsewhere in this
// codebase (only the coarse role allowlist in
// middleware/userAdminAccessControl.js) — this is a small static role→
// permission map, not a parallel authorization system: it only gates the
// new routes in routes/admin/customer.js and routes/admin/notification.js.

export const PERMISSIONS = {
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
  INTEGRATION_CREDENTIAL_MANAGE: "integration_credential.manage",
  ZOHO_INVOICE_MANAGE: "zoho_invoice.manage",

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
    PERMISSIONS.CUSTOMER_NOTIFICATION_RETRY,
    PERMISSIONS.CUSTOMER_PREFERENCE_MANAGE,
    PERMISSIONS.EMAIL_TEMPLATE_MANAGE,
    PERMISSIONS.ZOHO_INVOICE_MANAGE,
    // View-only for Data Operations — no execute permissions, matching the
    // existing "view-only for non-superadmin" pattern used elsewhere in
    // this file. Adjustable later if a manager role needs to run LOW-risk
    // seeders themselves.
    ...DATA_OPERATIONS_VIEW_ONLY,
  ],
  supervisor: VIEW_ONLY,
  staff: VIEW_ONLY,
  operator: VIEW_ONLY,
};

export const roleHasPermission = (role, permission) =>
  (ROLE_PERMISSIONS[role] || []).includes(permission);
