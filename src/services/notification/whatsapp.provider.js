// Real WhatsApp Business Cloud API (Meta Graph API) integration.
//
// This environment has no WHATSAPP_ACCESS_TOKEN configured, so every call
// below returns `whatsapp_provider_not_configured` without making a network
// request — identical no-op behavior to the Phase 1 stub. Once real
// Meta Business credentials + approved message templates exist, setting
// WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN in the environment turns
// this on with no other code changes.
//
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

import axios from "axios";
import { envs } from "../../config/index.js";

const isConfigured = () => !!(envs.whatsapp.phoneNumberId && envs.whatsapp.accessToken);

// Maps our internal template keys (constants/notificationEvents.js) to
// Meta-approved WhatsApp template names. WhatsApp requires templates to be
// pre-approved by Meta by name — these are illustrative until real
// templates are submitted/approved; unmapped keys fall back to the raw key.
const TEMPLATE_NAME_MAP = {
  otp: "otp_code",
  order_shipped: "order_shipped",
  order_out_for_delivery: "order_out_for_delivery",
  order_delivered: "order_delivered",
  order_cancelled: "order_cancelled",
  abandoned_cart: "abandoned_cart_reminder",
};

const buildComponents = (data = {}) => {
  const params = Object.values(data)
    .filter((v) => v !== undefined && v !== null && typeof v !== "object")
    .map((v) => ({ type: "text", text: String(v) }));
  if (!params.length) return undefined;
  return [{ type: "body", parameters: params }];
};

const post = async ({ to, templateKey, data }) => {
  if (!isConfigured()) {
    return { success: false, error: "whatsapp_provider_not_configured" };
  }
  if (!to) {
    return { success: false, error: "no_mobile_on_file" };
  }

  const templateName = TEMPLATE_NAME_MAP[templateKey] || templateKey;
  const url = `https://graph.facebook.com/${envs.whatsapp.apiVersion}/${envs.whatsapp.phoneNumberId}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en_US" },
          ...(buildComponents(data) ? { components: buildComponents(data) } : {}),
        },
      },
      {
        headers: {
          Authorization: `Bearer ${envs.whatsapp.accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    return {
      success: true,
      provider_message_id: response.data?.messages?.[0]?.id || null,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
    };
  }
};

export const sendOtp = ({ to, otp, data } = {}) => post({ to, templateKey: "otp", data: { otp, ...data } });
export const sendTransactional = ({ to, templateKey, data } = {}) => post({ to, templateKey, data });
export const sendTemplate = ({ to, templateKey, data } = {}) => post({ to, templateKey, data });
