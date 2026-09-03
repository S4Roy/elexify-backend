import Razorpay from "razorpay";
import { envs } from "../../config/index.js";
import { getIntegrationConfig } from "./index.js";

export const getRazorpayConfig = async () => {
  const credentials = await getIntegrationConfig("razorpay", envs.razorpay);
  if (!credentials) throw new Error("Razorpay integration is disabled");
  if (!credentials.key_id || !credentials.key_secret) throw new Error("Razorpay credentials are incomplete");
  return credentials;
};

export const getRazorpayClient = async () => {
  const credentials = await getRazorpayConfig();
  return new Razorpay({ key_id: credentials.key_id, key_secret: credentials.key_secret });
};

export const getRazorpayContext = async () => {
  const credentials = await getRazorpayConfig();
  return {
    credentials,
    client: new Razorpay({ key_id: credentials.key_id, key_secret: credentials.key_secret }),
  };
};
