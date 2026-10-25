import assert from "node:assert/strict";
import test from "node:test";
import { decideSharing, paymentShareRequest } from "../src/fintech_document_share.js";

const payment = {
  event_id: "evt_2026_0412",
  payment_reference: "pay_9821",
  document_base64: "JVBERi0xLjQK",
  document_name: "payment-confirmation.pdf",
  recipient: "auditor@example.com",
  amount_minor: 125_000,
  currency: "USD",
};

test("elevated risk gets a shorter external-sharing window", () => {
  const decision = decideSharing(paymentShareRequest.parse({ ...payment, risk_score: 64 }));

  assert.deepEqual(decision, {
    action: "share",
    watermark: "EXTERNAL COPY | auditor@example.com | evt_2026_0412",
    link_ttl_seconds: 300,
  });
});

test("high risk routes the event to manual review", () => {
  const decision = decideSharing(paymentShareRequest.parse({ ...payment, risk_score: 91 }));

  assert.deepEqual(decision, {
    action: "manual_review",
    reason: "risk_score_requires_review",
  });
});
