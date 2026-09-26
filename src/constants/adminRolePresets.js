// Starter admin roles for a typical ecommerce team, created by the
// "admin-roles" data operation. Seed data only: once a role exists it is
// owned by the admin panel, and re-seeding never changes its permissions.
// Runtime guards read Role.permissions from MongoDB, never this file.
//
// None of these roles can manage staff or roles, run data operations, edit
// integration credentials or force-cancel orders; those stay with the owner.
import { PERMISSIONS as P } from "./adminPermissions.js";
import { MODULE_PERMISSIONS } from "./rbacPermissions.js";

const CRUD = ["view", "create", "update", "delete"];
const perms = (module, actions = CRUD) => actions.map((action) => `${module}.${action}`);

const CATALOG_VIEW = [
  "products.view", "categories.view", "brands.view", "attributes.view",
  "specifications.view", "classification.view", "tags.view", "inventory.view",
];

const CATALOG_MANAGE = [
  ...perms("products", [...CRUD, "import", "export"]),
  ...perms("categories", [...CRUD, "export"]),
  ...perms("brands"), ...perms("attributes"), ...perms("specifications"),
  ...perms("classification"), ...perms("tags"),
  ...perms("media", ["view", "create", "update"]),
  "inventory.view", "inventory.adjust",
];

const CUSTOMER_VIEW = ["customers.view", P.CUSTOMER_VIEW, P.CUSTOMER_CONTACT_VIEW];

// Cancelling an order needs both keys: the route refunds paid orders.
const ORDER_CANCEL = [P.ORDER_CANCEL_MANAGE, "orders.refund"];

const ORDER_HANDLING = [
  "orders.view", "orders.fulfill", "orders.export",
  P.ORDER_CREATE, P.ORDER_STATUS_MANAGE, P.ORDER_ADDRESS_MANAGE, ...ORDER_CANCEL,
  P.RETURN_VIEW, P.RETURN_REVIEW,
];

const SHIPPING_VIEW = ["shipping.view", "shipping_zones.view", "shipping_rates.view", "shipping_classes.view", "pincodes.view"];

const SHIPPING_MANAGE = [
  "shipping.view", "shipping.update",
  ...perms("shipping_zones"), ...perms("shipping_rates"), ...perms("shipping_classes"),
  ...perms("pincodes", ["view", "create", "update"]),
];

const STOREFRONT_CONTENT = [
  ...perms("home"), ...perms("banners"), ...perms("pages"), ...perms("blogs"),
  ...perms("faqs"), ...perms("testimonials"), ...perms("navigation"),
  "header.view", "header.update", "topbar.view", "topbar.update",
  ...perms("media", ["view", "create", "update"]),
  "seo.view", "seo.update",
];

const CAMPAIGNS = [
  ...perms("discounts"), ...perms("banners"),
  "home.view", "home.update", "seo.view", "seo.update",
  "subscribers.view", "subscribers.update",
  "media.view", "media.create",
  P.CUSTOMER_NOTIFICATION_VIEW, P.CUSTOMER_NOTIFICATION_CREATE, P.CUSTOMER_NOTIFICATION_SEND,
  P.CUSTOMER_NOTIFICATION_SCHEDULE, P.CUSTOMER_NOTIFICATION_CANCEL, P.CUSTOMER_NOTIFICATION_ANALYTICS,
];

const SUPPORT_INBOX = [...perms("contacts", ["view", "update"]), ...perms("enquiries", ["view", "update"])];

// Read-only access leaves out customer.contact.view, which gates customers'
// saved addresses.
const READ_ONLY = [...MODULE_PERMISSIONS.filter((key) => key.endsWith(".view")), P.CUSTOMER_VIEW, P.RETURN_VIEW];

const role = (key, name, description, permissions) => ({
  key, name, description, permissions: [...new Set(permissions)].sort(),
});

export const ADMIN_ROLE_PRESETS = [
  role("preset-store-manager", "Store Manager",
    "Runs the store day to day: catalogue, orders, refunds, customers, shipping, content and promotions. Cannot manage staff, roles or system settings.",
    [
      ...CATALOG_MANAGE, ...ORDER_HANDLING, ...SHIPPING_MANAGE, ...STOREFRONT_CONTENT, ...CAMPAIGNS, ...SUPPORT_INBOX,
      ...CUSTOMER_VIEW, "customers.create", "customers.update",
      P.CUSTOMER_ADDRESS_MANAGE, P.CUSTOMER_PREFERENCE_MANAGE, P.CUSTOMER_NOTIFICATION_RETRY,
      P.ORDER_PAYMENT_MANAGE, P.ORDER_REOPEN_MANAGE,
      ...perms("ratings", ["view", "update", "delete"]),
      "settings.view",
    ]),
  role("preset-catalog-manager", "Catalog Manager",
    "Adds and edits products, categories, brands, attributes and media, and adjusts stock.",
    [...CATALOG_MANAGE, "ratings.view"]),
  role("preset-order-manager", "Order Manager",
    "Processes orders end to end: creates, updates, ships, cancels and handles returns.",
    [...ORDER_HANDLING, ...CUSTOMER_VIEW, P.CUSTOMER_ADDRESS_MANAGE, ...CATALOG_VIEW, ...SHIPPING_VIEW]),
  role("preset-warehouse", "Warehouse Staff",
    "Packs and ships orders, updates order status and adjusts stock. No refunds or customer contact details.",
    [...CATALOG_VIEW, "inventory.adjust", "orders.view", "orders.fulfill", P.ORDER_STATUS_MANAGE, P.RETURN_VIEW, ...SHIPPING_VIEW]),
  role("preset-customer-support", "Customer Support",
    "Looks up customers and orders, fixes delivery addresses, replies to enquiries and moderates reviews. Escalates cancellations and refunds.",
    [
      ...CUSTOMER_VIEW, P.CUSTOMER_ADDRESS_MANAGE, P.CUSTOMER_NOTIFICATION_VIEW, P.CUSTOMER_NOTIFICATION_RETRY,
      "orders.view", P.ORDER_ADDRESS_MANAGE, P.RETURN_VIEW,
      ...SUPPORT_INBOX, ...perms("ratings", ["view", "update"]),
      "products.view", "inventory.view", "shipping.view", "pincodes.view",
    ]),
  role("preset-marketing-manager", "Marketing Manager",
    "Runs promotions: coupons, banners, homepage, SEO, newsletter subscribers and push campaigns.",
    [...CAMPAIGNS, ...perms("testimonials"), "ratings.view", "products.view", "categories.view", "brands.view"]),
  role("preset-content-editor", "Content Editor",
    "Edits storefront content: homepage, banners, pages, blog, FAQs, menus and SEO.",
    [...STOREFRONT_CONTENT, "products.view", "categories.view", "brands.view"]),
  role("preset-finance", "Accounts & Finance",
    "Reviews orders and payments, issues refunds, exports reports and manages Zoho invoices.",
    [
      "orders.view", "orders.export", "orders.refund", P.ORDER_PAYMENT_MANAGE, P.RETURN_VIEW,
      P.ZOHO_INVOICE_MANAGE, P.ZOHO_SYNC_VIEW,
      "customers.view", P.CUSTOMER_VIEW, "discounts.view", "products.view", "products.export", "inventory.view",
    ]),
  role("preset-viewer", "Read-only Viewer",
    "Can open every admin section without changing anything. Customers' saved addresses are hidden.",
    READ_ONLY),
];
