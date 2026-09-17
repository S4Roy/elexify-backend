import SmsTemplate from "../../models/SmsTemplate.js";

/**
 * Get SMS Template
 * @param {String} event - matches SmsTemplate.event (constants/notificationEvents.js templateKey, or "otp_login"/"otp_generic")
 * @returns {Object|null} - the active template, or null if not found/inactive
 */
export const getTemplate = async (event) => {
  try {
    const result = await SmsTemplate.findOne({ event, status: "active" }).lean();
    return result;
  } catch (error) {
    console.error("Error fetching SMS template:", error);
    return null;
  }
};
