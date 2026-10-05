import { StatusError } from "../../../config/StatusErrors.js";
import User from "../../../models/User.js";
import DeviceToken from "../../../models/DeviceToken.js";
import NotificationPreference from "../../../models/NotificationPreference.js";
import { pushConfig, eligibleEnvironmentUser } from "./config.js";

// Explains why a customer can or cannot receive a test push in this
// environment, so admins see the specific blocker instead of a generic error.
export async function testEligibility(id) {
  const customer = await User.findOne({ _id: id, role: "customer", deleted_at: null }).select("status").lean();
  if (!customer) throw StatusError.notFound("Customer not found.");
  const config = await pushConfig();
  const [devices, consent] = await Promise.all([
    DeviceToken.find({ user_id: id, environment: config.environment, project_id: config.projectId, is_active: true })
      .select("platform app_version last_seen_at -_id").sort({ last_seen_at: -1 }).limit(100).lean(),
    NotificationPreference.exists({ user_id: id, "marketing.push": true }),
  ]);
  const reason = !config.enabled ? "Push is disabled or not configured."
    : !(await eligibleEnvironmentUser(id, config)) ? "Customer is not allowed in this test environment."
    : customer.status !== "active" ? "Customer account is inactive."
    : !devices.length ? "No active push device registered."
    : !consent ? "Customer has not opted in to marketing push notifications." : null;
  return { devices, can_test: !reason, reason };
}
