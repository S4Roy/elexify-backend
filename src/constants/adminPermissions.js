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
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const VIEW_ONLY = [
  PERMISSIONS.CUSTOMER_VIEW,
  PERMISSIONS.CUSTOMER_CONTACT_VIEW,
  PERMISSIONS.CUSTOMER_NOTIFICATION_VIEW,
];

export const ROLE_PERMISSIONS = {
  superadmin: ALL_PERMISSIONS,
  manager: [
    ...VIEW_ONLY,
    PERMISSIONS.CUSTOMER_VERIFICATION_OVERRIDE,
    PERMISSIONS.CUSTOMER_NOTIFICATION_RETRY,
    PERMISSIONS.CUSTOMER_PREFERENCE_MANAGE,
  ],
  supervisor: VIEW_ONLY,
  staff: VIEW_ONLY,
  operator: VIEW_ONLY,
};

export const roleHasPermission = (role, permission) =>
  (ROLE_PERMISSIONS[role] || []).includes(permission);
