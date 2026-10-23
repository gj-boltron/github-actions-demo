package com.example.invoice;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

/**
 * Minimal web front end for the calculator: serves the page at {@code /} and calculates invoices at
 * {@code POST /api/invoice}. Uses the JDK's built-in HTTP server, so no extra dependencies.
 */
public final class InvoiceServer {

  private static final Gson GSON = new Gson();

  private final HttpServer server;

  /**
   * Starts the server on localhost.
   *
   * @param port the port to listen on, or 0 for any free port
   * @throws IOException if the port cannot be opened
   */
  public InvoiceServer(int port) throws IOException {
    byte[] page = readPage();
    server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
    server.createContext("/", exchange -> handle(exchange, page));
    server.start();
  }

  /**
   * Returns the port the server listens on.
   *
   * @return the port
   */
  public int port() {
    return server.getAddress().getPort();
  }

  /** Stops the server. */
  public void stop() {
    server.stop(0);
  }

  /**
   * Starts the server on {@code PORT} (default 8080).
   *
   * @param args unused
   * @throws IOException if the port cannot be opened
   */
  public static void main(String[] args) throws IOException {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
    InvoiceServer server = new InvoiceServer(port);
    System.out.println("Invoice service running at http://localhost:" + server.port());
  }

  private static byte[] readPage() throws IOException {
    try (InputStream in = InvoiceServer.class.getResourceAsStream("/public/index.html")) {
      return Objects.requireNonNull(in, "public/index.html is missing").readAllBytes();
    }
  }

  private static void handle(HttpExchange exchange, byte[] page) throws IOException {
    try (exchange) {
      String method = exchange.getRequestMethod();
      String path = exchange.getRequestURI().getPath();
      if ("GET".equals(method) && "/".equals(path)) {
        send(exchange, 200, "text/html; charset=utf-8", page);
      } else if ("POST".equals(method) && "/api/invoice".equals(path)) {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String json;
        int status;
        try {
          json = GSON.toJson(InvoiceCalculator.calculateFromJson(body));
          status = 200;
        } catch (RuntimeException e) {
          // Invalid JSON, a missing field or a rule broken by LineItem / InvoiceCalculator
          json = error("Invalid invoice: " + e.getMessage());
          status = 400;
        }
        send(exchange, status, "application/json", json.getBytes(StandardCharsets.UTF_8));
      } else {
        send(
            exchange, 404, "application/json", error("Not found").getBytes(StandardCharsets.UTF_8));
      }
    }
  }

  private static String error(String message) {
    JsonObject body = new JsonObject();
    body.addProperty("error", message);
    return GSON.toJson(body);
  }

  private static void send(HttpExchange exchange, int status, String contentType, byte[] body)
      throws IOException {
    exchange.getResponseHeaders().set("Content-Type", contentType);
    exchange.sendResponseHeaders(status, body.length);
    exchange.getResponseBody().write(body);
  }
}
