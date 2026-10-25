import { z } from "zod";
import { infrai } from "./infrai.js";

export const paymentShareRequest = z.object({
  event_id: z.string().min(1).max(80),
  payment_reference: z.string().min(1).max(80),
  document_base64: z.string().min(1),
  document_name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.pdf$/),
  recipient: z.string().email(),
  amount_minor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  risk_score: z.number().int().min(0).max(100),
});

export type PaymentShareRequest = z.infer<typeof paymentShareRequest>;

export type SharingDecision =
  | { action: "share"; watermark: string; link_ttl_seconds: number }
  | { action: "manual_review"; reason: string };

export function decideSharing(input: PaymentShareRequest): SharingDecision {
  if (input.risk_score >= 80) {
    return { action: "manual_review", reason: "risk_score_requires_review" };
  }
  return {
    action: "share",
    watermark: `EXTERNAL COPY | ${input.recipient} | ${input.event_id}`,
    link_ttl_seconds: input.risk_score >= 50 ? 300 : 900,
  };
}

function decodePdf(value: string): ArrayBuffer {
  const encoded = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  return Uint8Array.from(Buffer.from(encoded, "base64")).buffer;
}

export type AuditNotification = {
  event_id: string;
  payment_reference: string;
  action: SharingDecision["action"];
  risk_score: number;
  occurred_at: string;
  object_key?: string;
};

export async function sharePaymentDocument(
  input: PaymentShareRequest,
  bucket: string,
): Promise<{ decision: SharingDecision; download_url?: string; audit: AuditNotification }> {
  const decision = decideSharing(input);
  const auditBase = {
    event_id: input.event_id,
    payment_reference: input.payment_reference,
    action: decision.action,
    risk_score: input.risk_score,
    occurred_at: new Date().toISOString(),
  } as const;

  if (decision.action === "manual_review") return { decision, audit: auditBase };

  const objectKey = `payment-events/${input.event_id}/${input.document_name}`;
  const watermarked = await infrai.pdf.watermark({
    pdf: input.document_base64,
    text: decision.watermark,
    opacity: 0.22,
    position: "center",
  });
  const upload = await infrai.storage.object.presign(bucket, objectKey, {
    op: "put",
    expires_seconds: 120,
    content_type: "application/pdf",
    idempotency_key: `${input.event_id}:upload`,
  });
  const uploadResponse = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: decodePdf(watermarked.pdf),
  });
  if (!uploadResponse.ok) throw new Error(`Document upload rejected with status ${uploadResponse.status}`);

  const download = await infrai.storage.object.presign(bucket, objectKey, {
    op: "get",
    expires_seconds: decision.link_ttl_seconds,
    response_disposition: `attachment; filename="${input.document_name}"`,
    idempotency_key: `${input.event_id}:download`,
  });
  return {
    decision,
    download_url: download.url,
    audit: { ...auditBase, object_key: objectKey },
  };
}
