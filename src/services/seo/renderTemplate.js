// Tiny {variable} substitution helper shared by the title/description
// generators. Missing/empty variables resolve to "" rather than inventing a
// placeholder value.
export const renderTemplate = (template, variables = {}) => {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    const value = variables[key];
    return value !== undefined && value !== null && value !== ""
      ? String(value).trim()
      : "";
  });
};
