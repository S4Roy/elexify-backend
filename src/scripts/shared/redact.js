// Central secret redaction for anything persisted by the data-operations
// system (SystemOperationLog lines, SystemOperationExecution metadata,
// audit metadata). Nothing that touches Mongo from runner.js should skip
// this — see plan constraint: never log/store secrets.
//
// Two layers:
//   1. Key-based: any object key whose name looks secret-shaped has its
//      value replaced outright, regardless of value shape.
//   2. Value-based: known secret *shapes* inside strings (Mongo URIs with
//      credentials, Authorization headers, bearer tokens, JWTs) are matched
//      and masked even when the surrounding key name is innocuous (e.g. a
//      raw connection string embedded in a free-text log message).

const SECRET_KEY_PATTERN = /(password|passwd|pwd|secret|token|otp|api[_-]?key|apikey|auth|credential|private[_-]?key|access[_-]?token|refresh[_-]?token|mongo(db)?[_-]?uri|smtp)/i;

const VALUE_PATTERNS = [
  // mongodb(+srv)://user:pass@host — mask the credential segment only.
  { regex: /(mongodb(?:\+srv)?:\/\/)([^/@\s]+)@/gi, replace: (_m, scheme) => `${scheme}***:***@` },
  // Authorization: Bearer <token> / bare bearer tokens
  { regex: /\b(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, replace: (_m, prefix) => `${prefix}[REDACTED]` },
  // JWT-shaped: header.payload.signature
  { regex: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, replace: () => "[REDACTED_JWT]" },
  // 4-8 digit OTP-shaped standalone numbers preceded by the word otp/code
  { regex: /\b(otp|code)\s*[:=]?\s*\d{4,8}\b/gi, replace: (_m, label) => `${label}: [REDACTED]` },
  // A secret-shaped label followed by its value in free text (not just a
  // JSON/object key — e.g. a log message that literally says
  // "password: hunter2" or "api_key=abc123"), regardless of what that
  // value looks like.
  { regex: /\b(password|passwd|pwd|secret|token|otp|api[_-]?key|apikey|auth|credential|private[_-]?key|access[_-]?token|refresh[_-]?token|smtp[_-]?password)\s*[:=]\s*\S+/gi, replace: (_m, label) => `${label}: [REDACTED]` },
];

const REDACTED_VALUE = "[REDACTED]";
const MAX_DEPTH = 8;

const redactString = (value) => {
  let result = value;
  for (const { regex, replace } of VALUE_PATTERNS) {
    result = result.replace(regex, replace);
  }
  return result;
};

// Deep-clones `input` while redacting: object values whose key matches
// SECRET_KEY_PATTERN, and any string value matching a known secret shape.
// Non-plain-object/array values (Date, ObjectId, etc.) are stringified
// defensively at the leaf rather than walked further.
export const redact = (input, depth = 0) => {
  if (input === null || input === undefined) return input;
  if (depth > MAX_DEPTH) return "[REDACTED_DEPTH_LIMIT]";

  if (typeof input === "string") return redactString(input);
  if (typeof input !== "object") return input;

  if (Array.isArray(input)) return input.map((item) => redact(item, depth + 1));

  // Plain object (or object-like) — walk own enumerable keys only.
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = REDACTED_VALUE;
      continue;
    }
    out[key] = redact(value, depth + 1);
  }
  return out;
};

// Convenience for the common "single log message string" case.
export const redactMessage = (message) => {
  if (typeof message !== "string") return redact(message);
  return redactString(message);
};
