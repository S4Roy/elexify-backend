export const assertSafeE2EDatabase = (uri, environment = process.env) => {
  if (environment.E2E_ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error("Refusing E2E database mutation: set E2E_ALLOW_DESTRUCTIVE_SEED=true explicitly");
  }
  const parsed = new URL(uri);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  const database = parsed.pathname.replace(/^\//, "");
  if (parsed.protocol !== "mongodb:" || !localHosts.has(parsed.hostname)) {
    throw new Error("Refusing E2E database mutation: MongoDB must be local");
  }
  if (!database || !database.toLowerCase().includes("elexify_e2e")) {
    throw new Error("Refusing E2E database mutation: database name must contain elexify_e2e");
  }
  if (/prod|production/i.test(database)) {
    throw new Error("Refusing E2E database mutation: production-like database name");
  }
  return { database, hostname: parsed.hostname };
};

