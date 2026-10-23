package com.example.invoice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class InvoiceCalculatorTest {

  private static BigDecimal bd(String value) {
    return new BigDecimal(value);
  }

  @Test
  void calculatesSubtotalTaxAndTotal() {
    InvoiceTotals totals =
        InvoiceCalculator.calculate(
            List.of(new LineItem("Toner", 2, bd("50")), new LineItem("Paper", 10, bd("4.50"))),
            bd("0.12"),
            BigDecimal.ZERO);

    assertThat(totals)
        .isEqualTo(new InvoiceTotals(bd("145.00"), bd("0.00"), bd("17.40"), bd("162.40")));
  }

  @Test
  void appliesDiscountBeforeTax() {
    InvoiceTotals totals =
        InvoiceCalculator.calculate(
            List.of(new LineItem("Printer", 1, bd("1000"))), bd("0.10"), bd("10"));

    assertThat(totals.discount()).isEqualByComparingTo("100");
    assertThat(totals.tax()).isEqualByComparingTo("90");
    assertThat(totals.total()).isEqualByComparingTo("990");
  }

  @Test
  void parsesJson() {
    InvoiceTotals totals =
        InvoiceCalculator.calculateFromJson(
            """
            {"items":[{"description":"Toner","quantity":2,"unitPrice":50}],"taxRate":0.12}
            """);

    assertThat(totals.total()).isEqualByComparingTo("112");
  }

  @Test
  void rejectsEmptyInvoice() {
    assertThatThrownBy(() -> InvoiceCalculator.calculate(List.of(), bd("0.1"), BigDecimal.ZERO))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void rejectsInvalidTaxRate() {
    List<LineItem> items = List.of(new LineItem("Toner", 1, bd("1")));
    assertThatThrownBy(() -> InvoiceCalculator.calculate(items, bd("1.5"), BigDecimal.ZERO))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void rejectsInvalidDiscount() {
    List<LineItem> items = List.of(new LineItem("Toner", 1, bd("1")));
    assertThatThrownBy(() -> InvoiceCalculator.calculate(items, bd("0.1"), bd("101")))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void rejectsInvalidLineItems() {
    assertThatThrownBy(() -> new LineItem(" ", 1, bd("1")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new LineItem("Toner", 0, bd("1")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new LineItem("Toner", 1, bd("-1")))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
