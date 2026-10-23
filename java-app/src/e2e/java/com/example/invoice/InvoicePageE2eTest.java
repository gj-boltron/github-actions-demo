package com.example.invoice;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;
import static org.assertj.core.api.Assertions.assertThat;

import com.microsoft.playwright.APIResponse;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.Tracing;
import com.microsoft.playwright.options.AriaRole;
import com.microsoft.playwright.options.RequestOptions;
import java.io.IOException;
import java.nio.file.Paths;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInfo;

/** End-to-end tests: a real Chromium uses the web page served by {@link InvoiceServer}. */
class InvoicePageE2eTest {

  // -De2e.headed=true (or the e2e-ui profile) shows the browser in slow motion
  private static final boolean HEADED = Boolean.getBoolean("e2e.headed");

  private static InvoiceServer server;
  private static Playwright playwright;
  private static Browser browser;

  private BrowserContext context;
  private Page page;

  @BeforeAll
  static void startServerAndBrowser() throws IOException {
    server = new InvoiceServer(0);
    playwright = Playwright.create();
    browser =
        playwright
            .chromium()
            .launch(
                new BrowserType.LaunchOptions().setHeadless(!HEADED).setSlowMo(HEADED ? 500 : 0));
  }

  @AfterAll
  static void stopServerAndBrowser() {
    playwright.close();
    server.stop();
  }

  @BeforeEach
  void openPage() {
    context =
        browser.newContext(
            new Browser.NewContextOptions().setBaseURL("http://localhost:" + server.port()));
    // A trace per test: replay it with Playwright's trace viewer
    context.tracing().start(new Tracing.StartOptions().setScreenshots(true).setSnapshots(true));
    page = context.newPage();
    page.navigate("/");
  }

  @AfterEach
  void closePage(TestInfo testInfo) {
    String name = testInfo.getTestMethod().orElseThrow().getName();
    context
        .tracing()
        .stop(
            new Tracing.StopOptions()
                .setPath(Paths.get("target/playwright-traces/" + name + ".zip")));
    context.close();
  }

  @Test
  void calculatesSubtotalTaxAndTotalForSeveralItems() {
    page.getByLabel("Description 1").fill("Toner");
    page.getByLabel("Quantity 1").fill("2");
    page.getByLabel("Unit price 1").fill("50");

    page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Add item")).click();
    page.getByLabel("Description 2").fill("Paper");
    page.getByLabel("Quantity 2").fill("10");
    page.getByLabel("Unit price 2").fill("4.5");

    page.getByLabel("Tax rate (%)").fill("12");
    page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Calculate")).click();

    assertThat(page.getByTestId("subtotal")).hasText("145.00");
    assertThat(page.getByTestId("discount")).hasText("0.00");
    assertThat(page.getByTestId("tax")).hasText("17.40");
    assertThat(page.getByTestId("total")).hasText("162.40");
  }

  @Test
  void appliesTheDiscountBeforeTax() {
    page.getByLabel("Description 1").fill("Printer");
    page.getByLabel("Unit price 1").fill("1000");
    page.getByLabel("Tax rate (%)").fill("10");
    page.getByLabel("Discount (%)").fill("10");
    page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Calculate")).click();

    assertThat(page.getByTestId("discount")).hasText("100.00");
    assertThat(page.getByTestId("tax")).hasText("90.00");
    assertThat(page.getByTestId("total")).hasText("990.00");
  }

  @Test
  void showsTheServerValidationErrorForAnInvalidQuantity() {
    page.getByLabel("Description 1").fill("Bad");
    page.getByLabel("Quantity 1").fill("-1");
    page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Calculate")).click();

    assertThat(page.getByRole(AriaRole.ALERT)).containsText("quantity");
    assertThat(page.getByRole(AriaRole.TABLE, new Page.GetByRoleOptions().setName("Totals")))
        .isHidden();
  }

  @Test
  void apiRejectsAnInvoiceWithoutItems() {
    APIResponse response =
        page.request()
            .post(
                "/api/invoice", RequestOptions.create().setData("{\"items\":[],\"taxRate\":0.1}"));

    assertThat(response.status()).isEqualTo(400);
    assertThat(response.text()).contains("error");
  }
}
