import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import SearchEvent from "../../models/SearchEvent.js";
import { parseAction, saveAction } from "./actions.js";
import { list } from "../../controllers/admin/operations/searchInsights.js";
import { record } from "../../controllers/site/inventory/product/searchEvent.js";
const uri = process.env.SEARCH_INSIGHTS_TEST_MONGODB_URI;
const suite = uri ? describe : describe.skip;
const base = { event_id: "2cf75338-fc04-4f40-aecb-f82b65b57645", query: "USB cable", platform: "web", action: "submitted" };
const save = body => saveAction(parseAction(body), body.action);
const app = express();
app.use(express.json());
app.post("/events", record);
app.get("/insights", list);
suite("search action analytics with real MongoDB", () => {
  beforeAll(async () => {
    if (!new URL(uri).pathname.startsWith("/elexify_search_insights_test_")) throw new Error("Use an isolated search insights test database");
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    await SearchEvent.init();
  });
  beforeEach(async () => { await SearchEvent.deleteMany({}); });
  afterAll(async () => {
    if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  it("deduplicates concurrent submissions, retries and results into one action", async () => {
    await Promise.all(Array.from({ length: 5 }, () => save(base)));
    await Promise.all(Array.from({ length: 5 }, () => save({ ...base, action: "results_viewed", result_count: 0 })));
    expect(await SearchEvent.countDocuments()).toBe(1);
    expect(await SearchEvent.findOne().lean()).toMatchObject({ submitted: true, results_viewed: true, result_count: 0 });
    const res = await request(app).get("/insights").expect(200);
    expect(res.body.data.summary).toMatchObject({ searches: 1, measured: 1, zero_results: 1 });
  });
  it("handles results arriving before submission and preserves initial result context", async () => {
    await save({ ...base, action: "results_viewed", result_count: 4 });
    await save(base);
    await save({ ...base, action: "results_viewed", result_count: 0, filters: { category: "missing" } });
    expect(await SearchEvent.findOne().lean()).toMatchObject({ submitted: true, result_count: 4, filtered: false });
  });
  it("keeps failures unknown, separates suggestions and legacy, and supports scope filters", async () => {
    await save(base);
    await save({ ...base, event_id: "2cf75338-fc04-4f40-aecb-f82b65b57646", action: "suggestion_selected", product_id: "product1" });
    await SearchEvent.collection.insertOne({ query: "pl", result_count: 0, created_at: new Date() });
    const res = await request(app).get("/insights").expect(200);
    expect(res.body.data.summary).toMatchObject({ searches: 1, measured: 0, zero_results: 0 });
    expect((await request(app).get("/insights?event_type=suggestion")).body.data.summary.searches).toBe(1);
    expect((await request(app).get("/insights?event_type=legacy")).body.data.docs[0]._id).toBe("pl");
    await save({ ...base, action: "results_viewed", result_count: 0, filters: { category: "missing" } });
    expect((await request(app).get("/insights?filtered=true&platform=web")).body.data.summary.zero_results).toBe(1);
    expect((await request(app).get("/insights?filtered=false")).body.data.totalDocs).toBe(0);
  });
  it("paginates grouped terms and counts only matching no-result queries", async () => {
    for (let i = 0; i < 3; i++) {
      await save({ ...base, event_id: `2cf75338-fc04-4f40-aecb-f82b65b5764${i}`, query: `query${i}`, action: "results_viewed", result_count: i });
    }
    const res = await request(app).get("/insights?page=2&limit=1").expect(200);
    expect(res.body.data).toMatchObject({ totalDocs: 3, page: 2, hasNextPage: true });
    expect(res.body.data.docs[0]._id).toBe("query1");
    const zeros = await request(app).get("/insights?zero_results=true").expect(200);
    expect(zeros.body.data.totalDocs).toBe(1);
    expect(zeros.body.data.summary).toMatchObject({ searches: 3, measured: 3, zero_results: 1 });
  });
  it("validates events and can disable analytics independently", async () => {
    await request(app).post("/events").send({ ...base, action: "results_viewed", result_count: -1 }).expect(400);
    await request(app).post("/events").send(base).expect(204);
    expect(await SearchEvent.countDocuments()).toBe(1);
    process.env.SEARCH_INSIGHTS_ENABLED = "false";
    try {
      await request(app).post("/events").send({ ...base, event_id: "2cf75338-fc04-4f40-aecb-f82b65b57647" }).expect(204);
      expect(await SearchEvent.countDocuments()).toBe(1);
    } finally { delete process.env.SEARCH_INSIGHTS_ENABLED; }
  });
});
