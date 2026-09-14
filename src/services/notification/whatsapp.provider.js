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
import { NOTIFICATION_EVENTS } from "../../constants/notificationEvents.js";

const isConfigured = () => !!(envs.whatsapp.phoneNumberId && envs.whatsapp.accessToken);

// Maps our internal template keys (constants/notificationEvents.js
// `templateKey`) to Meta-approved WhatsApp template names. WhatsApp
// requires every template to be pre-approved by Meta by name before it can
// be sent — these names are what to submit for approval; nothing here
// sends until the real name is approved and (if it differs) the mapping
// below is updated to match. `otp` is included separately since OTP isn't
// part of the NOTIFICATION_EVENTS registry (its own dedicated flow).
const TEMPLATE_NAME_MAP = {
  otp: "otp_code",
  ...Object.fromEntries(
    Object.values(NOTIFICATION_EVENTS).map(({ templateKey }) => [templateKey, templateKey])
  ),
};

// Ordered variable list per template key — must match what the approved
// Meta template's {{1}} {{2}} ... placeholders expect. Mirrors
// notificationEvents.js `messagingVariables`; `otp` (outside that registry)
// is added explicitly.
const TEMPLATE_VARIABLES_MAP = {
  otp: ["otp"],
  ...Object.fromEntries(
    Object.values(NOTIFICATION_EVENTS).map(({ templateKey, messagingVariables }) => [
      templateKey,
      messagingVariables || [],
    ])
  ),
};

// Builds positional body parameters in the template's declared variable
// order (falling back to whatever data was passed, for unmapped
// templateKeys) rather than relying on `data`'s own key order, which is
// determined by whichever caller happened to build the object.
const buildComponents = (templateKey, data = {}) => {
  const order = TEMPLATE_VARIABLES_MAP[templateKey];
  const values = order ? order.map((key) => data[key]) : Object.values(data);
  const params = values
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

  const templateName = TEMPLATE_NAME_MAP[templateKey];
  if (!templateName) {
    return { success: false, error: "whatsapp_template_not_configured" };
  }
  const url = `https://graph.facebook.com/${envs.whatsapp.apiVersion}/${envs.whatsapp.phoneNumberId}/messages`;
  const components = buildComponents(templateKey, data);

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
          ...(components ? { components } : {}),
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
