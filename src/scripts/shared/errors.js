// Errors runner.js throws/catches. Kept separate from result.js so both
// the runner and individual operation handlers can import just what they
// need without a circular dependency on runner.js itself.

// A stable {code, statusCode} pair the admin controllers map straight onto
// an HTTP response, and the CLI maps onto a human-readable line + exit
// code. `message` is always safe to show a caller — never a raw stack
// trace or secret (see shared/redact.js, applied again defensively by the
// runner before persisting/returning any error).
export class OperationError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

// A handler throws this instead of a plain Error to report that it made
// real, partial progress before failing (e.g. 60 of 100 rows written, then
// a write failed) — runner.js classifies this as PARTIAL, never SUCCESS,
// and persists `partialResult` as the execution's result.
export class PartialExecutionError extends Error {
  constructor(message, partialResult) {
    super(message);
    this.partialResult = partialResult;
  }
}
