package com.example.invoice;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * A single invoice line.
 *
 * @param description what is being billed
 * @param quantity number of units, must be positive
 * @param unitPrice price per unit, must not be negative
 */
public record LineItem(String description, int quantity, BigDecimal unitPrice) {

  /** Validates the line item. */
  public LineItem {
    Objects.requireNonNull(description, "description");
    Objects.requireNonNull(unitPrice, "unitPrice");
    if (description.isBlank()) {
      throw new IllegalArgumentException("description must not be blank");
    }
    if (quantity <= 0) {
      throw new IllegalArgumentException("quantity must be positive");
    }
    if (unitPrice.signum() < 0) {
      throw new IllegalArgumentException("unitPrice must not be negative");
    }
  }

  /** Returns quantity multiplied by unit price. */
  public BigDecimal amount() {
    return unitPrice.multiply(BigDecimal.valueOf(quantity));
  }
}
