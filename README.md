# eCommerce Backend (Transformers, PCB Boards, etc.)

![GitHub Repo](https://img.shields.io/github/stars/S4Roy/ecommerce-backend?style=social)

## 🚀 Project Overview

This is a **large-scale eCommerce backend** designed to handle sales of **electronic components** like **transformers, PCB boards, and more**. Built with a **scalable architecture**, it ensures seamless product management, order processing, and secure transactions.

## 🛠 Tech Stack

- **Backend:** Node.js (Express.js)
- **Database:** MongoDB (Mongoose ODM)
- **Authentication:** JWT (JSON Web Token)
- **API Documentation:** Swagger
- **Validation:** Joi (celebrate middleware)
- **Cloud Storage:** AWS S3
- **Payment Gateway:** Razorpay/Stripe
- **Caching:** Redis
- **Message Queue:** RabbitMQ
- **Containerization:** Docker

## 📂 Folder Structure

```bash
📦 ecommerce-backend
├── src
│   ├── config          # Environment Configurations
│   ├── controllers     # Business Logic & API Handling
│   ├── middlewares     # Authentication, Logging, Error Handling
│   ├── models          # MongoDB Schemas (Mongoose)
│   ├── routes          # API Endpoints
│   ├── services        # Business Services (Payment, Email, etc.)
│   ├── helpers         # Utility Functions & Helpers
│   ├── validations     # Joi Schema Validations
│   ├── resources       # Static Files & Assets
├── .env                # Environment Variables
├── Dockerfile          # Docker Configuration
├── README.md           # Project Documentation
└── package.json        # Dependencies & Scripts
```

## 🔑 Features

✅ **User Authentication** (JWT-based)  
✅ **Role-based Access Control** (Admin, Vendor, Customer)  
✅ **Product Management** (CRUD operations for products)  
✅ **Secure Payment Integration** (Stripe/Razorpay)  
✅ **Order Processing & Tracking**  
✅ **Admin Dashboard APIs**  
✅ **Swagger API Documentation**  
✅ **Unit & Integration Testing**  
✅ **Scalable Microservices Architecture**  
✅ **Deployment via Docker & CI/CD**

## 📜 API Documentation

Swagger is enabled for API documentation. Run the server and visit:

```
http://localhost:5000/api-docs
```

## 🛠 Setup & Installation

```sh
# Clone the repository
git clone https://github.com/S4Roy/ecommerce-backend.git
cd ecommerce-backend

# Install dependencies
npm install

# Setup .env file
cp .env.example .env

# Start the server
npm run dev
```

## 🖼️ Media CDN (CloudFront)

Media is stored in S3 as relative keys; the API builds absolute URLs at read time.

- `AWS_CDN_URL` — CloudFront base URL (e.g. `https://d1234abcd.cloudfront.net`). When set, all media URLs use it; when empty they fall back to the S3 bucket URL.
- `CLOUDFRONT_DISTRIBUTION_ID` — used to invalidate keys that admin edits overwrite in place (media replace, brand/tag/classification/page images). The `S3_ACCESS_KEY` IAM user needs `cloudfront:CreateInvalidation` on the distribution. Leave empty to skip invalidation.
- Storefront (`elexify.online`): set `CDN_HOSTNAME` to the same host so `next/image` accepts it.

## 🚀 Deployment

- **Cloud Deployment:** AWS EC2 / DigitalOcean / Heroku

## 👥 Contributors

- **Subhankar Roy** ([@S4Roy](https://github.com/S4Roy))

## 📜 License

This project is **MIT licensed**.

## Media images

Every image written to S3 goes through `src/services/media/optimizeImage.js` (called by `s3Handler.uploadToS3` and the media library upload): EXIF rotation applied, at most 1600px on the long side, JPEG q80 for photos, palette PNG when the image has transparency. GIF, SVG and video are stored untouched, and an image is kept as-is if re-encoding would not save at least 10%. Uploads get `Cache-Control: public, max-age=31536000, immutable`; the media library also stores a 600px JPEG thumbnail in `Media.thumbnail`.

Images uploaded before this existed are fixed with the `optimize-media-images` data operation (admin Data Operations, or `node src/scripts/cli.js dry-run|run optimize-media-images` on the server). It backs up each original to the private `originals-backup/` prefix, rewrites the image under the same key, marks it with `x-amz-meta-optimized: 1` so re-runs skip it, and invalidates CloudFront per top-level folder. Roll back with `node src/scripts/optimizeMediaImages.js --restore <key-or-prefix>`.
