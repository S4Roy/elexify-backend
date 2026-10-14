// GST HSN/SAC code as stored on products and variations: digits only, or null when blank.
export const hsnOrNull = (value) => {
  const code = String(value ?? "").replace(/\s+/g, "");
  return code || null;
};
