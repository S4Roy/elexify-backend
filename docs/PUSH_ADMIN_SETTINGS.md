# Admin-managed Firebase Push

Open **Settings → Integration Credentials → Firebase Push Notifications**. Access requires the existing `integration_credential.manage` permission; changes reuse its audit logging and encrypted credential storage.

Admin controls:
- Enabled/disabled.
- Firebase project ID, matching the installed app configuration.
- Firebase environment (must match server APP_ENV).
- Test customer MongoDB IDs, comma-separated, for development/staging.
- Optional service-account client email and RSA private key, copied from service-account JSON. The PEM input accepts real newlines or JSON-style escaped newlines. Both credential fields are required together. Keys are encrypted, never returned, and blank inputs preserve saved values.

Saving enabled settings validates project/credential formats and environment guards. **Validate configuration** checks local configuration and guard status; it does not authenticate to Google or send a message. Use **Customers → Customer details → Push devices → Send test push** for an end-to-end test. Device registration and marketing consent are still required for that test.

Keep deployment identity and root secrets server-side:
- `APP_ENV`: development, staging, or production.
- `FCM_PRODUCTION_PROJECT_ID`: required outside production; must differ from the sending project.
- `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`: stable encryption secret for managed credentials; existing system fallback rules still apply.
- `PUSH_CONFIRMATION_SECRET`: campaign confirmation signing secret.
- Database connection and optional ADC/workload identity setup.

Remove `PUSH_ENABLED` from the server environment to delegate enablement to the admin toggle. **An explicit `PUSH_ENABLED=false` always stops push**, even if admin enables it. With no managed record, existing PUSH_ENABLED/FCM_PROJECT_ID/FCM_ENVIRONMENT/PUSH_TEST_USER_IDS behavior remains available and defaults to off. Removing managed values restores these environment fallbacks; disable the integration to pause without restoring fallbacks.

Changes are read from MongoDB by API and worker processes without restart. Disabling prevents new claims; already in-flight provider requests may finish. Configuration read/decryption failures fail closed for push. No schema migration is required: this uses the existing integration_credentials collection. Managed credentials may be omitted to use server ADC. To switch back to ADC after storing a private key, remove managed values and recreate the operational settings without credential fields.

The native app still requires its environment-specific Firebase client configuration and build variables. Backend admin settings cannot change the Firebase project compiled into an installed app or grant phone notification permission.
