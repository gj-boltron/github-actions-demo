import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { calculateInvoice } from "./invoice.js";

const page = readFileSync(new URL("../public/index.html", import.meta.url));
const port = Number(process.env.PORT ?? 3000);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
    return;
  }

  if (req.method === "POST" && req.url === "/api/invoice") {
    let input: unknown;
    try {
      input = await readJson(req);
    } catch {
      sendJson(res, 400, { error: "Request body is not valid JSON" });
      return;
    }
    try {
      sendJson(res, 200, calculateInvoice(input as never));
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendJson(res, 400, { error: z.prettifyError(error) });
        return;
      }
      throw error;
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

createServer((req, res) => {
  void handle(req, res);
}).listen(port, () => {
  console.log(`Invoice calculator running at http://localhost:${String(port)}`);
});
