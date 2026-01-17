import axios from "axios";
import { envs } from "../../config/index.js";

/**
 * Send SMS via Fast2SMS
 * @param {Object} options
 * @param {string|string[]} options.to - Mobile number(s)
 * @param {string} options.message - SMS message
 * @param {string} [options.sender_id] - Optional sender ID
 * @param {string} [options.route] - Default: q (transactional)
 */
export const sendSMS = async ({
  to,
  message,
  variables = [],
  sender_id = envs.FAST2SMS.sender_id,
  route = envs.FAST2SMS.route,
}) => {
  try {
    if (!to || !message) {
      throw new Error("Mobile number and message are required");
    }

    const numbers = Array.isArray(to) ? to.join(",") : to;

    const variables_values = variables.join("|");

    const response = await axios.post(
      envs.FAST2SMS.URL,
      {
        route,
        sender_id,
        message,
        variables_values,
        numbers,
      },
      {
        headers: {
          authorization: envs.FAST2SMS.authorization,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    return {
      success: response.data?.return === true,
      response: response.data,
    };
  } catch (error) {
    console.error("Fast2SMS Error:", {
      message: error.message,
      response: error.response?.data,
    });

    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};
