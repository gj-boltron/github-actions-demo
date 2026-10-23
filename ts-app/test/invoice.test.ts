import { describe, expect, it } from "vitest";
import { calculateInvoice, roundCurrency } from "../src/invoice.js";

describe("roundCurrency", () => {
  it("rounds to two decimals", () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(2.344)).toBe(2.34);
  });
});

describe("calculateInvoice", () => {
  it("calculates subtotal, tax and total", () => {
    const totals = calculateInvoice({
      items: [
        { description: "Toner", quantity: 2, unitPrice: 50 },
        { description: "Paper", quantity: 10, unitPrice: 4.5 },
      ],
      taxRate: 0.12,
    });

    expect(totals).toEqual({ subtotal: 145, discount: 0, tax: 17.4, total: 162.4 });
  });

  it("applies the discount before tax", () => {
    const totals = calculateInvoice({
      items: [{ description: "Printer", quantity: 1, unitPrice: 1000 }],
      taxRate: 0.1,
      discountPercent: 10,
    });

    expect(totals).toEqual({ subtotal: 1000, discount: 100, tax: 90, total: 990 });
  });

  it("rejects an invoice without items", () => {
    expect(() => calculateInvoice({ items: [], taxRate: 0.1 })).toThrow();
  });

  it("rejects a negative quantity", () => {
    expect(() =>
      calculateInvoice({
        items: [{ description: "Bad", quantity: -1, unitPrice: 1 }],
        taxRate: 0,
      }),
    ).toThrow();
  });
});
