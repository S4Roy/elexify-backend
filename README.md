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

## 🚀 Deployment

- **Cloud Deployment:** AWS EC2 / DigitalOcean / Heroku

## 👥 Contributors

- **Subhankar Roy** ([@S4Roy](https://github.com/S4Roy))

## 📜 License

This project is **MIT licensed**.
