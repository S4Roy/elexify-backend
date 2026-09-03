import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Optional ignored developer-only secrets. Production should inject these
// through its secret manager/environment instead of deploying this file.
const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(configDirectory, "../..");
config({ path: path.join(projectDirectory, ".env.credentials.local") });
config({ path: path.join(projectDirectory, ".env") });

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET || "";

export const envs = {
  FRONTEND_URL: process.env.FRONTEND_URL || "",
  basePath: process.env.SERVER_BASEPATH || "",
  env: process.env.NODE_ENV || "dev",
  port: Number(process.env.SERVER_PORT) || 4000,
  db: {
    host: process.env.MYSQL_HOSTNAME || "localhost",
    port: process.env.MYSQL_PORT || 3306,
    database: process.env.MYSQL_DB_NAME,
    username: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    dialect: process.env.DIALECT || "mysql",
  },
  base_url: process.env.BASE_URL || "", // Set the base URL from the environment variable
  pms_url: process.env.PMS_URL || "", // Set the base URL from the environment variable
  apiKey: process.env.API_KEY || "",
  integrationCredentials: {
    // A separate key is preferred. ACCESS_TOKEN_SECRET is a compatibility
    // fallback for existing deployments; SHA-256 domain separation in the
    // crypto utility ensures the AES key is not the raw JWT signing key.
    encryptionKey:
      process.env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY || accessTokenSecret,
    usesAccessTokenFallback:
      !process.env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY && Boolean(accessTokenSecret),
  },
  MONGODB_URI: process.env.MONGODB_URI || `mongodb://${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}`,
  passwordSalt: Number(process.env.PASSWORD_SALT_ROUND) || 12,
  jwt: {
    accessToken: {
      secret: accessTokenSecret,
      expiry: Number(process.env.ACCESS_TOKEN_EXPIRED) || 3600,
    },
  },
  smtp: {
    email: process.env.SMTP_AUTH_EMAIL,
    password: process.env.SMTP_AUTH_PASSWORD,
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 465,
    secure: process.env.SMTP_SECURE == "no" ? false : true,
    fromEmail: process.env.SMTP_FROM_EMAIL,
  },
  otp: {
    expiry_minutes: Number(process.env.OTP_EXPIRY_MINUTES) || 10,
    max_attempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
    resend_interval_seconds:
      Number(process.env.OTP_RESEND_INTERVAL_SECONDS) || 60,
  },
  aws: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
    region: process.env.S3_REGION || "",
    cdnUrl: process.env.AWS_CDN_URL || "",
  },
  s3: {
    BUCKET_NAME: process.env.S3_BUCKET_NAME || "",
    BUCKET_URL: process.env.S3_BUCKET_URL || "",
    BASE_URL: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/`,
  },
  razorpay: {
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
    webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET,
    account_id: process.env.RAZORPAY_ACCOUNT_ID || "",
  },
  operationalAlerts: {
    webhookUrl: process.env.OPERATIONS_ALERT_WEBHOOK_URL || "",
    cooldownSeconds: Math.max(60, Number(process.env.OPERATIONS_ALERT_COOLDOWN_SECONDS) || 900),
    transactionAbortThreshold: Math.max(1, Number(process.env.OPERATIONS_TRANSACTION_ABORT_THRESHOLD) || 3),
  },
  paypal: {
    client_id: process.env.PAYPAL_CLIENT_ID,
    secret: process.env.PAYPAL_SECRET,
    env: process.env.PAYPAL_ENV,
  },
  // Company/GST/invoice details live in SiteSetting (see
  // src/services/invoiceService/getCompanySettings.js) rather than here,
  // so an admin can edit them via the existing Settings page without a
  // redeploy.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
  },
  shiprocket: {
    email: process.env.SHIP_ROCKET_EMAIL,
    password: process.env.SHIP_ROCKET_PASSWORD,
    channel_id: process.env.SHIP_ROCKET_CHANNEL_ID,
  },
  zoho: {
    ORG_ID: process.env.ZOHO_ORG_ID || "",
    CLIENT_ID: process.env.ZOHO_CLIENT_ID || "",
    CLIENT_SECRET: process.env.ZOHO_CLIENT_SECRET || "",
    REFRESH_TOKEN: process.env.ZOHO_REFRESH_TOKEN || "",
    ACCESS_TOKEN: process.env.ZOHO_ACCESS_TOKEN || "",
    BASE_URL: process.env.ZOHO_BASE_URL || "https://books.zoho.com/api/v3",
  },
  FAST2SMS: {
    authorization: process.env.FAST2SMS_API_KEY || "",
    URL: "https://www.fast2sms.com/dev/bulkV2",
    sender_id: "ELXFY",
    route: "dlt",
  },
  whatsapp: {
    // Meta WhatsApp Business Cloud API (graph.facebook.com). Unset in every
    // environment today — services/notification/whatsapp.provider.js treats
    // a missing accessToken as "not configured" and never makes a network
    // call, so this is a real integration waiting on credentials, not a
    // stub.
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
  },
  NO_IMAGE: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/noimage.svg`,
  DEFAULT_LANGUAGE: process.env.DEFAULT_LANGUAGE || "en",
  maxFileUploadSize: process.env.maxFileUploadSize || 20,
  siteUrl: process.env.siteUrl || "",
  adminSiteUrl: process.env.adminSiteUrl || "",
  BACKEND_URL: process.env.BACKEND_URL || "",
  PROJECT_NAME: process.env.PROJECT_NAME || "",
  DEFAULT_PAGE_LIMIT: process.env.DEFAULT_PAGE_LIMIT || 20,
  DEFAULT_FOLDER_ID: process.env.DEFAULT_FOLDER_ID || 1,
  db1: {
    host: process.env.MYSQL_HOST1 || "localhost",
    port: process.env.MYSQL_PORT1 || 3306,
    database: process.env.MYSQL_DATABASE1,
    username: process.env.MYSQL_USERNAME1,
    password: process.env.MYSQL_PASSWORD1,
    dialect: process.env.DIALECT1 || "mysql",
  },
  SWAGGER_UI_ACCESS: {
    USER: process.env.SWAGGER_UI_ACCESS_USER || "",
    PASSWORD: process.env.SWAGGER_UI_ACCESS_PASSWORD || "",
  },
  pagination: {
    limit: 20,
  },
};
