// Same {logs:[], info/warn/error} shape as
// services/emailTemplate/seedRunner.js's makeLogger(), generalized for
// every registry operation. Messages are redacted at push time so nothing
// secret-shaped ever makes it into the in-memory log array in the first
// place (runner.js also redacts again defensively before persisting).
import { redactMessage } from "./redact.js";

export const createLogger = () => {
  const logs = [];
  const push = (level, message) => {
    logs.push({ level, message: redactMessage(String(message)), timestamp: new Date().toISOString() });
  };
  return {
    logs,
    info: (message) => push("INFO", message),
    warn: (message) => push("WARN", message),
    error: (message) => push("ERROR", message),
  };
};
