import path, { resolve, dirname } from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import basicAuth from "express-basic-auth";
import bearerToken from "express-bearer-token";
import swaggerUi from "swagger-ui-express";
import { handleError, morganConf, StatusSuccess } from "./config/index.js";
import fileUpload from "express-fileupload";
import Pusher from "pusher";
import mongoose from "./config/mongoose.js";
import * as middleware from "./middleware/index.js";
import i18n from "i18n";
import cron from "node-cron";

// import rules from "./config/rules.js";
// import bcrypt from "./config/bcrypt.js";
// import mail from "./config/mail.js";
// import db from "./config/database.js";
// import pusherConfig from "./config/pusher.js";
import * as CronJobs from "./controllers/cronjobs/index.js";
import { notificationService } from "./services/index.js";
import SystemOperationLog from "./models/SystemOperationLog.js";
import { v1AuthRouter } from "./routes/auth/index.js";
import { v1CallBackRouter } from "./routes/callback/index.js";
import { v1UserRouter } from "./routes/user/index.js";
import { v1AdminRouter } from "./routes/admin/index.js";
import { v1SiteRouter } from "./routes/site/index.js";
import { v1WebhookRouter } from "./routes/webhook/index.js";
import { razorpayWebhookRouter } from "./routes/payments/razorpayWebhook.js";

// import indexRoutes from "./routes/index.js";
import { fileURLToPath } from "url";
import { envs } from "./config/index.js";
import { buildAllowedOrigins, buildCorsOptions } from "./config/corsOptions.js";
import { validateProductionEnv } from "./config/validateProductionEnv.js";
import { errors } from "celebrate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
validateProductionEnv();
// Initialize i18n before using it
i18n.configure({
  locales: ["en"],
  directory: resolve(__dirname, "./assets/locales"),
  defaultLocale: "en",
  objectNotation: true,
});
const app = express();

// Production runs behind a reverse proxy that sets X-Forwarded-For.
// Without this, Express doesn't trust that header, so express-rate-limit
// can't safely resolve the real client IP — it refuses to guess (rather
// than either rate-limiting the proxy's IP for everyone, or blindly
// trusting a header a client could spoof to dodge rate limits) and throws
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR instead. `1` trusts exactly one hop
// (the immediate proxy) — the standard setting for a single reverse proxy
// (nginx, a platform load balancer) in front of the app. Increase this if
// there's more than one proxy layer between the client and this server.
app.set("trust proxy", 1);

app.use(i18n.init); // ✅ Middleware for translations
// // Global Configuration
// global.CONFIG = {
//   DIR_PATH: __dirname,
//   rules,
//   bcrypt,
//   mail,
//   db,
//   pusher: pusherConfig,
//   DEMO_AC: "64895d42711473576ce39a7b",
// };

// // Initializing Pusher
// global.pusher = new Pusher({
//   appId: CONFIG.pusher.app_id,
//   key: CONFIG.pusher.key,
//   secret: CONFIG.pusher.secret,
//   cluster: CONFIG.pusher.cluster,
//   encryptionMasterKeyBase64: CONFIG.pusher.encryption_key,
// });

// Initialize Express App

// Security headers on every response (CSP disabled — the admin panel's
// Swagger UI and various inline assets aren't set up for it, and getting a
// CSP wrong silently breaks pages rather than failing loudly).
app.use(helmet({ contentSecurityPolicy: false }));

// Serve Static Files
// helmet's default Cross-Origin-Resource-Policy: same-origin blocks these
// from being embedded (<img>, iframe, etc.) from any other origin —
// including our own admin panel on a different subdomain. These assets
// (uploaded media, product images) are meant to be publicly embeddable
// anywhere, so relax CORP for this route specifically rather than
// weakening it for the API as a whole.
app.use("/public", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use("/public", express.static(path.join(__dirname, "../public")));
app.use(morganConf);

// Initialize CORS — restricted to the known first-party frontends (site,
// admin panel, local dev) instead of reflecting every origin.
const allowedOrigins = buildAllowedOrigins(
  "http://localhost:4200",
  "http://localhost:3000",
  "http://localhost:5173",
  "https://www.elexify.online",
  "https://elexify.baseweb.in",
  "https://inventory.elexify.online",
  "https://api.elexify.online",
);
app.use(cors(buildCorsOptions(allowedOrigins)));
app.use(
  express.json({
    limit: "5mb",
    // Preserves the exact raw request bytes alongside the parsed body, so
    // the Razorpay webhook handler can verify its HMAC signature against
    // the bytes Razorpay actually signed (a re-serialized JSON.stringify of
    // req.body would not reliably match).
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ limit: "5mb", extended: true }));
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 },
  abortOnLimit: true,
  safeFileNames: true,
  preserveExtension: 5,
}));
app.use(express.static("public"));
app.use(bearerToken());
app.use(StatusSuccess);
// Define API Routes
// NOTE: the legacy `GET ${basePath}/debug/db-seeding` route (zero auth,
// controllers/DbSeedingController.js) has been removed — its seeding logic
// now lives behind RBAC + audit logging as the `core-site-bootstrap` and
// `order-total-items-backfill` data-operations registry entries (see
// scripts/seeders/registry/operations/), run via the admin panel's Data
// Operations screen or `npm run data:run <key>`.
app.get(`${envs.basePath}/debug/currency`, CronJobs.exchangeRate);
app.get(`${envs.basePath}/debug/google-feed`, CronJobs.generateGoogleFeed);
cron.schedule("0 */12 * * *", async () => {
  try {
    await CronJobs.fetchAndUpdateExchangeRate(); // ✅ invoke the function
  } catch (e) {
    console.error("Exchange Rate Cron Failed", e);
  }
});
cron.schedule("*/5 * * * *", async () => {
  try {
    await CronJobs.updatePendingRazorpayPayments(); // ✅ invoke the function
  } catch (e) {
    console.error("updatePendingRazorpayPayments Cron Failed", e);
  }
});
cron.schedule("*/10 * * * *", async () => {
  try {
    await CronJobs.updatePendingPaypalPayments(); // ✅ invoke the function
  } catch (e) {
    console.error("updatePendingPaypalPayments Cron Failed", e);
  }
});

// Run every 6 hours
cron.schedule("0 */6 * * *", async () => {
  try {
    await CronJobs.generateGoogleFeed(); // ✅ invoke the function
  } catch (e) {
    console.error("generateGoogleFeed Cron Failed", e);
  }
});

// Drains queued/retrying NotificationJob rows (email/SMS/WhatsApp) — see
// services/notification/processNotificationQueue.js. Runs every minute so
// user-facing notifications (order confirmation, OTP-adjacent security
// alerts) go out promptly without ever blocking the request that enqueued
// them.
cron.schedule("* * * * *", async () => {
  try {
    await notificationService.processNotificationQueue();
  } catch (e) {
    console.error("processNotificationQueue Cron Failed", e);
  }
});

// Cleans up SystemOperationLog rows (per-line data-operations execution
// logs) older than SYSTEM_OPERATION_LOG_RETENTION_DAYS (default 30). Never
// touches SystemOperationExecution summaries or AuditLog — those are the
// long-retention, audit-purpose records per the data-operations plan; only
// the verbose per-line logs are short-retention. Runs once a day.
const SYSTEM_OPERATION_LOG_RETENTION_DAYS = Number(process.env.SYSTEM_OPERATION_LOG_RETENTION_DAYS) || 30;
cron.schedule("30 2 * * *", async () => {
  try {
    const cutoff = new Date(Date.now() - SYSTEM_OPERATION_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await SystemOperationLog.deleteMany({ created_at: { $lt: cutoff } });
    if (result.deletedCount) console.log(`SystemOperationLog retention cleanup: deleted ${result.deletedCount} log line(s) older than ${SYSTEM_OPERATION_LOG_RETENTION_DAYS} day(s).`);
  } catch (e) {
    console.error("SystemOperationLog retention cleanup Cron Failed", e);
  }
});

app.use(
  `${envs.basePath}/api/v1/auth`,
  middleware.authRateLimiter,
  middleware.accessTokenIfAny,
  v1AuthRouter,
);
app.use(`${envs.basePath}/callback`, v1CallBackRouter);
app.use(`${envs.basePath}/api/v1/payments/razorpay`, razorpayWebhookRouter);

app.use(
  `${envs.basePath}/api/v1/admin`,
  middleware.validateApiKey,
  middleware.validateAccessToken,
  middleware.userAdminAccessControl,
  v1AdminRouter,
);
app.use(
  `${envs.basePath}/api/v1/user`,
  middleware.validateApiKey,
  middleware.validateAccessToken,
  v1UserRouter,
);
app.use(
  `${envs.basePath}/api/v1/site`,
  middleware.accessTokenIfAny,
  middleware.validateApiKey,
  v1SiteRouter,
);
app.use(
  `${envs.basePath}/api/v1/webhook`,
  middleware.accessTokenIfAny,
  middleware.validateApiKey,
  v1WebhookRouter,
);
// app.use(`${envs.basePath}/api/v1/callback`, v1CallbackRouter);

app.use(`${envs.basePath}/public`, express.static("./public"));

// Initialize Swagger UI
app.use(
  "/api-docs/assets",
  express.static(path.join(__dirname, "assets", "swagger")),
);

const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    urls: [
      { url: "/api-docs/assets/auth.json", name: "AUTH API - v1" },
      { url: "/api-docs/assets/site.json", name: "SITE API - v1" },
      { url: "/api-docs/assets/user.json", name: "USER API - v1" },
      { url: "/api-docs/assets/admin.json", name: "ADMIN API - v1" },
      { url: "/api-docs/assets/debug.json", name: "DEBUG API - v1" },
    ],
  },
};

// Protect Swagger UI with Basic Auth
app.use(
  "/api-docs",
  basicAuth({
    users: { [envs.SWAGGER_UI_ACCESS.USER]: envs.SWAGGER_UI_ACCESS.PASSWORD },
    challenge: true,
    unauthorizedResponse: "Unauthorized access to API documentation",
  }),
  swaggerUi.serve,
  swaggerUi.setup(null, swaggerOptions),
);

console.log(`Swagger Docs available at http://localhost:${envs.port}/api-docs`);

// Handle 404 Errors
app.all(`${envs.basePath}/*`, (req, res) =>
  res.status(404).json({ message: "404 Not Found!" }),
);
app.use(errors());
app.use(handleError);
// Start the Server
const PORT = process.env.SERVER_PORT || 3000;
const HOSTNAME = process.env.SERVER_HOSTNAME || "localhost";

app.listen(PORT, HOSTNAME, () => {
  console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
});
