import { describe, expect, it } from "vitest";
import { CURRENCY, STRIPE_CURRENCY, formatMoney } from "@/lib/money";
import { money } from "@/lib/invoice-pdf";
import { formatMoney as timeClockMoney } from "@/lib/time-entries";

// One money format everywhere (screens, PDFs, emails, exports). US-only for
// now: changing currency starts in src/lib/money.ts.

describe("money", () => {
  it("formats US dollars with thousands separators and a leading minus", () => {
    expect(formatMoney(1250)).toBe("$1,250.00");
    expect(formatMoney(0.5)).toBe("$0.50");
    expect(formatMoney(-50)).toBe("-$50.00");
  });

  it("is the same formatter the invoice PDFs and time clock use", () => {
    expect(money(1250)).toBe(formatMoney(1250));
    expect(timeClockMoney(1250)).toBe(formatMoney(1250));
  });

  it("bills Stripe in the same currency", () => {
    expect(STRIPE_CURRENCY).toBe(CURRENCY.toLowerCase());
  });
});
