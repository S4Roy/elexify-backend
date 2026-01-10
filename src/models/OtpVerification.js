const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OtpVerificationSchema = new mongoose.Schema({
    'email': {
        type: String, required: false, default: null,
    },
    'mobile': {
        type: String, required: false, default: null,
    },
    'otp': {
        type: Number, required: true
    },
    'type': {
        type: String, required: true, enum: ["user-register", "user-login", "user-resetpassword"],
    },
    'token': {
        type: String, required: true, unique: true
    },
    'data': Schema.Types.Mixed,
    'created_at': {
        type: Date, required: true, default: Date.now
    },
    'updated_at': {
        type: Date, required: true, default: Date.now
    }
});

const OtpVerification = mongoose.model(global.CONFIG.db.collections.OTP_VERIFICATIONS, OtpVerificationSchema);

module.exports = OtpVerification;