// No WhatsApp provider is integrated yet. This stub gives the notification
// service and preference UI a real "whatsapp" channel to reason about
// (spec: provider abstraction so a provider can be plugged in later)
// without pretending to send anything or inventing fake credentials.
// Shape mirrors services/sms/fast2sms.service.js#sendSMS's return contract
// so the caller in services/notification/index.js can treat it uniformly.

const notConfigured = () =>
  Promise.resolve({ success: false, error: "whatsapp_provider_not_configured" });

export const sendOtp = () => notConfigured();
export const sendTransactional = () => notConfigured();
export const sendTemplate = () => notConfigured();
