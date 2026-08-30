import http from "node:http";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import OperationalEvent from "../../models/OperationalEvent.js";
import { recordOperationalEvent } from "./recordOperationalEvent.js";

const uri = process.env.TEST_MONGODB_URI?.replace(/\/[^/?]+(\?|$)/, "/elexify_alert_integration$1");
const suite = uri ? describe : describe.skip;

suite("operational webhook alert delivery", () => {
  let receiver;
  let deliveries;

  beforeAll(async () => {
    await mongoose.connect(uri, {
      autoIndex: false,
    });
    deliveries = [];
    receiver = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        deliveries.push(JSON.parse(body));
        res.writeHead(200).end("ok");
      });
    });
    receiver.listen(0, "127.0.0.1");
    await new Promise((resolve) => receiver.once("listening", resolve));
    process.env.OPERATIONS_ALERT_WEBHOOK_URL = `http://127.0.0.1:${receiver.address().port}/alerts`;
    process.env.OPERATIONS_ALERT_COOLDOWN_SECONDS = "900";
  });

  beforeEach(async () => {
    deliveries.length = 0;
    await mongoose.connection.db.dropDatabase();
  });

  afterAll(async () => {
    delete process.env.OPERATIONS_ALERT_WEBHOOK_URL;
    if (receiver) await new Promise((resolve) => receiver.close(resolve));
    if (uri) { await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); }
  });

  it("delivers once and suppresses duplicates during the cooldown", async () => {
    const input = {
      eventType: "webhook_dead_letter",
      severity: "critical",
      correlationId: "evt_masked_001",
      summary: "Razorpay webhook exhausted retries",
      metadata: { attempt: 5, secret: "must-not-leak" },
    };
    await Promise.all([recordOperationalEvent(input), recordOperationalEvent(input)]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      event_type: "webhook_dead_letter",
      severity: "critical",
      correlation_id: "evt_masked_001",
    });
    expect(JSON.stringify(deliveries[0])).not.toContain("must-not-leak");
    const event = await OperationalEvent.findOne().lean();
    expect(event.occurrences).toBe(2);
    expect(event.alert_delivery_count).toBe(1);
    expect(event.alert_last_status).toBe("sent");
  });
});
