import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pages: vi.fn(), settings: vi.fn() }));
vi.mock("../../models/Page.js", () => ({ default: { find: () => ({ select: () => ({ lean: mocks.pages }) }) } }));
vi.mock("../../models/ShippingSettings.js", () => ({ default: { getSingleton: mocks.settings } }));
import { getPartialCodTerms, validatePartialCodConsent } from "./partialCodConsent.js";

const settings = { cod_advance_percent: 20 };
const pages = ["terms-conditions", "refund-cancellations-policy", "privacy-policy"].map(slug => ({ slug, title: slug, content: `<p>${slug} original text</p>` }));
const amounts = { grandTotal: 1000, advanceAmount: 200, currency: "INR", userId: "customer1" };
const acceptance = terms => ({ accepted: true, version: terms.version, grand_total: 1000, advance_amount: 200 });
beforeEach(() => { vi.clearAllMocks(); mocks.pages.mockResolvedValue(pages); mocks.settings.mockResolvedValue(settings); });
describe("Partial COD acceptance", () => {
  it("preserves checkout when acceptance is not required", async () => {
    expect(await validatePartialCodConsent(undefined, null, amounts)).toBeNull();
    expect(mocks.pages).not.toHaveBeenCalled();
  });
  it.each([undefined, { accepted: false }, { accepted: "true" }])("rejects missing or non-explicit acceptance: %j", async value => {
    const terms = await getPartialCodTerms(settings);
    await expect(validatePartialCodConsent(value, terms, amounts)).rejects.toThrow("CONSENT_REQUIRED");
  });
  it("rejects outdated policy versions and mismatched amounts", async () => {
    const terms = await getPartialCodTerms(settings);
    for (const change of [{ version: "old" }, { grand_total: 900 }, { advance_amount: 100 }]) {
      await expect(validatePartialCodConsent({ ...acceptance(terms), ...change }, terms, amounts)).rejects.toThrow("CONSENT_CHANGED");
    }
  });
  it("changes version when policy content or advance percentage changes", async () => {
    const original = await getPartialCodTerms(settings);
    expect((await getPartialCodTerms({ cod_advance_percent: 30 })).version).not.toBe(original.version);
    mocks.pages.mockResolvedValue(pages.map(p => ({ ...p, content: "Updated policy" })));
    expect((await getPartialCodTerms(settings)).version).not.toBe(original.version);
  });
  it("blocks unpublished policies", async () => {
    mocks.pages.mockResolvedValue(pages.slice(1));
    const terms = await getPartialCodTerms(settings);
    expect(terms.available).toBe(false);
    await expect(validatePartialCodConsent(acceptance(terms), terms, amounts)).rejects.toThrow("CONSENT_UNAVAILABLE");
  });
  it("stores original policy text with server timestamp and amounts", async () => {
    const terms = await getPartialCodTerms(settings);
    expect(terms.policies[0]).not.toHaveProperty("content");
    const saved = await validatePartialCodConsent(acceptance(terms), terms, amounts);
    expect(saved).toMatchObject({ accepted: true, customer_id: "customer1", advance_amount: 200, grand_total: 1000, currency: "INR", version: terms.version });
    expect(saved.accepted_at).toBeInstanceOf(Date);
    expect(saved.policies[0].content).toBe(pages[0].content);
    mocks.pages.mockResolvedValue([]);
    expect(saved.policies[0].content).toBe(pages[0].content);
  });
  it("rejects a policy edit between quote and persistence", async () => {
    const terms = await getPartialCodTerms(settings);
    mocks.pages.mockResolvedValue(pages.map(p => ({ ...p, content: "Changed concurrently" })));
    await expect(validatePartialCodConsent(acceptance(terms), terms, amounts)).rejects.toThrow("CONSENT_CHANGED");
  });
});
