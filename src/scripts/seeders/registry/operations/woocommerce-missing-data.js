import { handler, KEY } from '../../../../services/legacyImport/operation.js';
import { PERMISSIONS } from '../../../../constants/adminPermissions.js';
export default {
  key: KEY,
  name: 'Import WooCommerce Data',
  description: 'Audit the configured old-store backup, then manually import missing customers, orders and product reviews. Existing records are preserved. Unmatched products, guest reviews, refunds and unsupported values are reported for review.',
  type: 'MIGRATION', category: 'commerce', version: 1,
  required: false, idempotent: true, risk: 'HIGH',
  allowedEnvironments: ['development', 'test', 'production'], dependencies: [],
  estimatedImpact: 'Creates missing customers, orders with their items, and reviews. Does not send notifications, charge payments, change stock or trigger shipping. A matching audit within the last hour and MongoDB transactions are required.',
  supportsDryRun: true, requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE, handler,
};
