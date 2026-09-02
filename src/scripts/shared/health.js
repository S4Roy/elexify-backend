// Normalizes a registry entry's raw healthCheck() result — which every
// operation returns as {status: HEALTHY|DEGRADED, expected, actual, detail}
// — into the {status: HEALTHY|WARNING|MISSING|ERROR|NOT_APPLICABLE,
// expected, valid, missing} shape the admin API/UI contract documents.
// Kept as one shared mapping so every operation's healthCheck stays a
// simple expected-vs-actual count function instead of each one having to
// know about the wire-level enum.
export const normalizeHealth = (raw) => {
  if (!raw || typeof raw !== "object") return { status: "NOT_APPLICABLE" };
  if (raw.status === "NOT_APPLICABLE" || raw.status === "ERROR") {
    return { status: raw.status, detail: raw.detail };
  }

  const expected = raw.expected ?? 0;
  const valid = raw.actual ?? 0;
  const missing = Math.max(0, expected - valid);

  let status = "HEALTHY";
  if (raw.status === "DEGRADED") {
    status = valid === 0 ? "MISSING" : "WARNING";
  }

  return { status, expected, valid, missing, detail: raw.detail };
};
