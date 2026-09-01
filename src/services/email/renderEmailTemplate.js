import Handlebars from "handlebars";
import "./emailComponents.js"; // side-effect: registers the shared partials templates may invoke (e.g. {{> ctaButton}})

// Matches a simple {{var}}, {{{var}}}, or {{var.path}} reference. Block
// helpers ({{#if}}, {{/if}}, {{else}}) and partial invocations ({{> foo}})
// aren't captured — partials manage their own internal data contract via
// `template.required_variables` instead (see below), since a partial's
// hash-params like `{{> ctaButton url=view_order_url}}` aren't plain
// `{{var}}` references this regex can see.
const PLACEHOLDER_RE = /\{\{\{?\s*([a-zA-Z0-9_.]+)\s*\}?\}\}/g;
const BLOCK_KEYWORDS = new Set(["if", "unless", "each", "else", "with"]);
// A variable only referenced inside {{#if}}/{{#unless}} is inherently
// optional — the block itself already guards its own absence — so those
// blocks are stripped before scanning for "missing" candidates. Simple,
// non-nested match (our templates don't nest these); a nested block would
// close early on the first {{/if}}, which is safe here but worth noting.
const CONDITIONAL_BLOCK_RE = /\{\{#(if|unless)\s+[^}]+\}\}[\s\S]*?\{\{\/\1\}\}/g;

const extractVariableNames = (source) => {
  const names = new Set();
  let match;
  const unguarded = (source || "").replace(CONDITIONAL_BLOCK_RE, "");
  PLACEHOLDER_RE.lastIndex = 0;
  while ((match = PLACEHOLDER_RE.exec(unguarded))) {
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
 * Renders `subject`, `preheader`, and `body` of an email template through
 * the same Handlebars compile + substitution pass (the subject/body
 * divergence — the subject was previously sent as the raw uncompiled DB
 * string — is the root cause this centralizes against). Reports any
 * variable the template declares as required (`template.required_variables`,
 * the canonical per-event contract — see constants/emailTemplateDefaults.js)
 * or references directly as `{{var}}` in any of the three fields, that has
 * no value in `substitutions`; and any leftover unresolved `{{...}}` in the
 * rendered output (defense in depth — see renderEmailTemplate.test.js for
 * why this is secondary to the required-variables check).
 */
export const renderEmailTemplate = (template, substitutions) => {
  const compileOptions = { data: { intl: { locales: "en-US" } } };

  const referencedVariables = new Set([
    ...(template.required_variables || []),
    ...extractVariableNames(template.subject),
    ...extractVariableNames(template.preheader),
    ...extractVariableNames(template.body),
  ]);
  const missingVariables = [...referencedVariables].filter((name) => !hasValue(substitutions, name));

  const subject = Handlebars.compile(template.subject || "")(substitutions, compileOptions);
  const preheader = Handlebars.compile(template.preheader || "")(substitutions, compileOptions);
  const body = Handlebars.compile(template.body || "")(substitutions, compileOptions);

  const unresolvedFields = [];
  if (/\{\{.*?\}\}/.test(subject)) unresolvedFields.push("subject");
  if (/\{\{.*?\}\}/.test(preheader)) unresolvedFields.push("preheader");
  if (/\{\{.*?\}\}/.test(body)) unresolvedFields.push("body");

  return { subject, preheader, body, missingVariables, unresolvedFields };
};
