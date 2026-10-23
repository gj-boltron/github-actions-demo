import { z } from "zod";

export const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

export const InvoiceInputSchema = z.object({
  items: z.array(LineItemSchema).min(1),
  taxRate: z.number().min(0).max(1),
  discountPercent: z.number().min(0).max(100).default(0),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type InvoiceInput = z.input<typeof InvoiceInputSchema>;

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

/** Rounds a monetary value to 2 decimal places (cents). */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateInvoice(input: InvoiceInput): InvoiceTotals {
  const { items, taxRate, discountPercent } = InvoiceInputSchema.parse(input);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discount = subtotal * (discountPercent / 100);
  const tax = (subtotal - discount) * taxRate;

  return {
    subtotal: roundCurrency(subtotal),
    discount: roundCurrency(discount),
    tax: roundCurrency(tax),
    total: roundCurrency(subtotal - discount + tax),
  };
}
