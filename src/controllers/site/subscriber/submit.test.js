import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../models/Subscriber.js", () => ({ default: { updateOne: vi.fn() } }));
import Subscriber from "../../../models/Subscriber.js";
import { submit } from "./submit.js";

describe("newsletter subscription", () => {
  beforeEach(() => vi.resetAllMocks());
  const invoke = async () => {
    const req = { body: { email: " Person@Example.com " }, get: () => "test", __: (s) => s };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await submit(req, res, next);
    return { res, next };
  };
  it("normalizes email and only sets metadata on insert", async () => {
    const { res, next } = await invoke();
    const [filter, update, options] = Subscriber.updateOne.mock.calls[0];
    expect(filter).toEqual({ email: "person@example.com" });
    expect(Object.keys(update)).toEqual(["$setOnInsert"]);
    expect(options).toMatchObject({ upsert: true, timestamps: false, runValidators: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
  it("returns the same response for new and existing subscribers", async () => {
    Subscriber.updateOne.mockResolvedValueOnce({ upsertedCount: 1 }).mockResolvedValueOnce({ matchedCount: 1 });
    const first = await invoke();
    const repeat = await invoke();
    expect(first.res.json.mock.calls).toEqual(repeat.res.json.mock.calls);
  });
  it("handles an email uniqueness race as success", async () => {
    Subscriber.updateOne.mockRejectedValue({ code: 11000, keyPattern: { email: 1 } });
    const { res, next } = await invoke();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
  it("forwards other database errors", async () => {
    const error = new Error("unavailable");
    Subscriber.updateOne.mockRejectedValue(error);
    const { res, next } = await invoke();
    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});
