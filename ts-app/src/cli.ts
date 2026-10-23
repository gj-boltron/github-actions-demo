#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { calculateInvoice } from "./invoice.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: invoice-calculator <invoice.json>");
  process.exit(1);
}

const totals = calculateInvoice(JSON.parse(readFileSync(file, "utf8")) as never);
console.table(totals);
