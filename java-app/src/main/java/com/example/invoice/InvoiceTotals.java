package com.example.invoice;

import java.math.BigDecimal;

/**
 * Calculated invoice amounts, rounded to cents.
 *
 * @param subtotal sum of all line amounts
 * @param discount discount applied to the subtotal
 * @param tax tax on the discounted subtotal
 * @param total amount due
 */
public record InvoiceTotals(
    BigDecimal subtotal, BigDecimal discount, BigDecimal tax, BigDecimal total) {}
