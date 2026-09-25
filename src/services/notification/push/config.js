export function pushConfig() {
  const environment = process.env.APP_ENV;
  const projectId = process.env.FCM_PROJECT_ID;
  const allowedUsers = (process.env.PUSH_TEST_USER_IDS || "")
    .split(",")
    .filter(Boolean);
  const enabled =
    process.env.PUSH_ENABLED === "true" &&
    ["development", "staging", "production"].includes(environment) &&
    !!projectId &&
    process.env.FCM_ENVIRONMENT === environment &&
    (environment === "production" ||
      (!!process.env.FCM_PRODUCTION_PROJECT_ID &&
        projectId !== process.env.FCM_PRODUCTION_PROJECT_ID &&
        allowedUsers.length > 0));
  return { enabled: !!enabled, environment, projectId, allowedUsers };
}
export function eligibleEnvironmentUser(userId) {
  const c = pushConfig();
  return (
    c.enabled &&
    (c.environment === "production" || c.allowedUsers.includes(String(userId)))
  );
}
