// Masks a contact identifier for safe display/logging, e.g.
// "subhankar@gmail.com" -> "s***@gmail.com", "9876543210" -> "******3210".
// Never returns the full identifier.

export const maskEmail = (email) => {
  if (!email || typeof email !== "string" || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  const visible = local.slice(0, 1) || "*";
  return `${visible}***@${domain}`;
};

export const maskMobile = (mobile, phoneCode = "") => {
  if (!mobile || typeof mobile !== "string") return null;
  const last4 = mobile.slice(-4).padStart(4, "*");
  const prefix = phoneCode ? `+${phoneCode} ` : "";
  return `${prefix}******${last4}`;
};
