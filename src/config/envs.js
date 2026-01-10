import { config } from "dotenv";
config();

export const envs = {
  FRONTEND_URL: process.env.FRONTEND_URL || "",
  basePath: process.env.SERVER_BASEPATH || "",
  env: process.env.NODE_ENV || "dev",
  port: Number(process.env.NODE_PORT) || 4000,
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
  MONGODB_URI: `mongodb://${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}`,
  passwordSalt: Number(process.env.PASSWORD_SALT_ROUND) || 12,
  jwt: {
    accessToken: {
      secret: process.env.ACCESS_TOKEN_SECRET || "",
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
  },
  paypal: {
    client_id: process.env.PAYPAL_CLIENT_ID,
    secret: process.env.PAYPAL_SECRET,
    env: process.env.PAYPAL_ENV,
  },
  shiprocket: {
    email: process.env.SHIP_ROCKET_EMAIL,
    password: process.env.SHIP_ROCKET_PASSWORD,
    channel_id: process.env.SHIP_ROCKET_CHANNEL_ID,
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
