import { createServer } from "node:http";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai.js";
import { paymentShareRequest, sharePaymentDocument } from "./fintech_document_share.js";

const bucket = process.env.DOCUMENT_BUCKET ?? "fintech-external-shares";
const port = Number(process.env.PORT ?? 3000);

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

await infrai.storage.bucket.create({ name: bucket });

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/payment-events/share") {
    send(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const input = paymentShareRequest.parse(await readJson(request));
    const result = await sharePaymentDocument(input, bucket);
    console.log(JSON.stringify({ notification: "payment_document_share", ...result.audit }));
    send(response, result.decision.action === "share" ? 201 : 202, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
      return;
    }
    send(response, 500, { error: "request_failed" });
  }
});

server.listen(port, () => console.log(`Payment share service listening on http://localhost:${port}`));
