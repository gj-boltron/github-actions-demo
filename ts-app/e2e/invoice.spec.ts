import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("calculates subtotal, tax and total for several items", async ({ page }) => {
  await page.getByLabel("Description 1").fill("Toner");
  await page.getByLabel("Quantity 1").fill("2");
  await page.getByLabel("Unit price 1").fill("50");

  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Description 2").fill("Paper");
  await page.getByLabel("Quantity 2").fill("10");
  await page.getByLabel("Unit price 2").fill("4.5");

  await page.getByLabel("Tax rate (%)").fill("12");
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect(page.getByTestId("subtotal")).toHaveText("145.00");
  await expect(page.getByTestId("discount")).toHaveText("0.00");
  await expect(page.getByTestId("tax")).toHaveText("17.40");
  await expect(page.getByTestId("total")).toHaveText("162.40");
});

test("applies the discount before tax", async ({ page }) => {
  await page.getByLabel("Description 1").fill("Printer");
  await page.getByLabel("Unit price 1").fill("1000");
  await page.getByLabel("Tax rate (%)").fill("10");
  await page.getByLabel("Discount (%)").fill("10");
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect(page.getByTestId("discount")).toHaveText("100.00");
  await expect(page.getByTestId("tax")).toHaveText("90.00");
  await expect(page.getByTestId("total")).toHaveText("990.00");
});

test("shows the server validation error for an invalid quantity", async ({ page }) => {
  await page.getByLabel("Description 1").fill("Bad");
  await page.getByLabel("Quantity 1").fill("-1");
  await page.getByRole("button", { name: "Calculate" }).click();

  await expect(page.getByRole("alert")).toContainText("quantity");
  await expect(page.getByRole("table", { name: "Totals" })).toBeHidden();
});

test("API rejects an invoice without items", async ({ request }) => {
  const response = await request.post("/api/invoice", { data: { items: [], taxRate: 0.1 } });

  expect(response.status()).toBe(400);
  expect(await response.json()).toHaveProperty("error");
});
