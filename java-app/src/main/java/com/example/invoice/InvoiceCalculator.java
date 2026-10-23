package com.example.invoice;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/** Calculates invoice totals. Mirrors the TypeScript project's logic. */
public final class InvoiceCalculator {

  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
  private static final Gson GSON = new Gson();

  private InvoiceCalculator() {}

  /**
   * Calculates subtotal, discount, tax and total.
   *
   * @param items invoice lines, at least one
   * @param taxRate tax rate between 0 and 1
   * @param discountPercent discount between 0 and 100
   * @return the rounded totals
   */
  public static InvoiceTotals calculate(
      List<LineItem> items, BigDecimal taxRate, BigDecimal discountPercent) {
    if (items.isEmpty()) {
      throw new IllegalArgumentException("an invoice needs at least one item");
    }
    if (taxRate.signum() < 0 || taxRate.compareTo(BigDecimal.ONE) > 0) {
      throw new IllegalArgumentException("taxRate must be between 0 and 1");
    }
    if (discountPercent.signum() < 0 || discountPercent.compareTo(HUNDRED) > 0) {
      throw new IllegalArgumentException("discountPercent must be between 0 and 100");
    }

    BigDecimal subtotal =
        items.stream().map(LineItem::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    BigDecimal discount = subtotal.multiply(discountPercent).divide(HUNDRED);
    BigDecimal tax = subtotal.subtract(discount).multiply(taxRate);
    BigDecimal total = subtotal.subtract(discount).add(tax);

    return new InvoiceTotals(cents(subtotal), cents(discount), cents(tax), cents(total));
  }

  /**
   * Parses an invoice JSON document ({@code items}, {@code taxRate}, optional {@code
   * discountPercent}) and calculates it.
   *
   * @param json the invoice document
   * @return the rounded totals
   */
  public static InvoiceTotals calculateFromJson(String json) {
    JsonObject root = GSON.fromJson(json, JsonObject.class);
    List<LineItem> items = new ArrayList<>();
    root.getAsJsonArray("items")
        .forEach(
            element -> {
              JsonObject item = element.getAsJsonObject();
              items.add(
                  new LineItem(
                      item.get("description").getAsString(),
                      item.get("quantity").getAsInt(),
                      item.get("unitPrice").getAsBigDecimal()));
            });
    BigDecimal discount =
        root.has("discountPercent")
            ? root.get("discountPercent").getAsBigDecimal()
            : BigDecimal.ZERO;
    return calculate(items, root.get("taxRate").getAsBigDecimal(), discount);
  }

  private static BigDecimal cents(BigDecimal value) {
    return value.setScale(2, RoundingMode.HALF_UP);
  }
}
