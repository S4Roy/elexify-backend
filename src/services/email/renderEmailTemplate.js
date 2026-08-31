import Handlebars from "handlebars";

// Matches a simple {{var}}, {{{var}}}, or {{var.path}} reference. Block
// helpers ({{#if}}, {{/if}}, {{else}}) aren't used by any current
// EmailTemplate and are excluded so they don't get flagged as "missing
// variables".
const PLACEHOLDER_RE = /\{\{\{?\s*([a-zA-Z0-9_.]+)\s*\}?\}\}/g;
const BLOCK_KEYWORDS = new Set(["if", "unless", "each", "else", "with"]);

const extractVariableNames = (source) => {
  const names = new Set();
  let match;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((match = PLACEHOLDER_RE.exec(source || ""))) {
    const rootName = match[1].split(".")[0];
    if (!BLOCK_KEYWORDS.has(rootName) && !rootName.startsWith("#") && !rootName.startsWith("/")) {
      names.add(rootName);
    }
  }
  return [...names];
};

const hasValue = (substitutions, name) => {
  const value = substitutions?.[name];
  return value !== undefined && value !== null && value !== "";
};

/**
 * Renders both `subject` and `body` of an email template through the same
 * Handlebars compile + substitution pass (the subject/body divergence — the
 * subject was previously sent as the raw uncompiled DB string — is the root
 * cause this centralizes against). Reports any variable referenced by
 * either field that has no value in `substitutions`, and any leftover
 * unresolved `{{...}}` in the rendered output, so a template/data mismatch
 * fails loudly instead of shipping a broken subject or body.
 */
export const renderEmailTemplate = (template, substitutions) => {
  const compileOptions = { data: { intl: { locales: "en-US" } } };

  const missingVariables = [
    ...new Set([
      ...extractVariableNames(template.subject),
      ...extractVariableNames(template.body),
    ]),
  ].filter((name) => !hasValue(substitutions, name));

  const subject = Handlebars.compile(template.subject || "")(substitutions, compileOptions);
  const body = Handlebars.compile(template.body || "")(substitutions, compileOptions);

  const unresolvedFields = [];
  if (/\{\{.*?\}\}/.test(subject)) unresolvedFields.push("subject");
  if (/\{\{.*?\}\}/.test(body)) unresolvedFields.push("body");

  return { subject, body, missingVariables, unresolvedFields };
};
