import { describe, it, expect } from "vitest";
import { addDaysYmd, addMonthsYm, istDayEnd, istDayStart, istFinancialYearStart, istParts, istRange, istYmd } from "./storeTime.js";
import { resolveDateRange } from "../helpers/dashboard/resolveDateRange.js";
import { getFinancialYear } from "../services/invoiceService/generateInvoiceNumber.js";

describe("storeTime (IST)", () => {
  it("maps instants to the IST calendar day", () => {
    expect(istYmd(new Date("2026-09-30T18:29:59Z"))).toBe("2026-09-30"); // 23:59 IST
    expect(istYmd(new Date("2026-09-30T18:30:00Z"))).toBe("2026-10-01"); // 00:00 IST next day
    expect(istParts(new Date("2026-12-31T19:00:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it("gives whole IST days for filter values", () => {
    expect(istDayStart("2026-09-01").toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(istDayEnd("2026-09-30").toISOString()).toBe("2026-09-30T18:29:59.999Z");
    expect(istDayStart("2026-09-01T20:00:00Z").toISOString()).toBe("2026-09-01T18:30:00.000Z"); // timestamp → its IST day
    expect(istRange(null, null)).toBeNull();
    expect(istRange("2026-09-01", null)).toEqual({ $gte: new Date("2026-08-31T18:30:00.000Z") });
  });

  it("does calendar arithmetic on IST dates", () => {
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonthsYm("2026-12", 1)).toBe("2027-01");
  });

  it("resolves dashboard/report ranges in IST", () => {
    const { startDate, endDate } = resolveDateRange({ from: "2026-09-01", to: "2026-09-30" });
    expect(startDate.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(endDate.toISOString()).toBe("2026-09-30T18:29:59.999Z");
    const rolling = resolveDateRange({ days: 7 });
    expect(istYmd(rolling.endDate)).toBe(istYmd());
    expect(Math.round((rolling.endDate - rolling.startDate) / 86400000)).toBe(7);
  });

  it("starts the financial year on 1 April IST", () => {
    expect(istFinancialYearStart(new Date("2026-03-31T18:29:00Z"))).toBe(2025); // 23:59 IST 31 Mar
    expect(istFinancialYearStart(new Date("2026-03-31T19:00:00Z"))).toBe(2026); // 00:30 IST 1 Apr
    expect(getFinancialYear(new Date("2026-03-31T19:00:00Z"))).toBe("2026-27");
  });
});
