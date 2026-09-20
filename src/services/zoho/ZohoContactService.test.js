import { beforeEach, describe, expect, it, vi } from "vitest";
import { findContact } from "./ZohoContactService.js";
import { booksClient } from "./ZohoBooksClient.js";

vi.mock("./ZohoBooksClient.js", async original => ({ ...await original(), booksClient: vi.fn() }));
const connection = { organization_id: "123" };
const contact = { contact_id: "1234", contact_name: "Existing Buyer", contact_type: "customer", email: "buyer@example.test", mobile: "9876543210" };
beforeEach(() => vi.clearAllMocks());

describe("Zoho customer matching", () => {
  it("matches an existing primary email before creating another contact", async () => {
    booksClient.mockResolvedValueOnce({ contacts: [] }).mockResolvedValueOnce({ contacts: [contact] });
    expect(await findContact(connection, { contact_name: "Elexify local-id", contact_persons: [{ email: "BUYER@example.test" }] })).toEqual(contact);
  });
  it("checks mobile records even when the provider's phone filter omits them", async () => {
    booksClient.mockResolvedValueOnce({ contacts: [] }).mockResolvedValueOnce({ contacts: [] }).mockResolvedValueOnce({ contacts: [contact] });
    expect(await findContact(connection, { contact_name: "Elexify guest-id", contact_persons: [{ mobile: "98765 43210" }] })).toEqual(contact);
    expect(booksClient).toHaveBeenCalledTimes(3);
  });
  it("never selects arbitrarily among multiple email matches", async () => {
    booksClient.mockResolvedValueOnce({ contacts: [] }).mockResolvedValueOnce({ contacts: [contact, { ...contact, contact_id: "5678" }] });
    await expect(findContact(connection, { contact_name: "Elexify local-id", contact_persons: [{ email: contact.email }] })).rejects.toThrow("MULTIPLE_REMOTE_MATCHES");
  });
});
