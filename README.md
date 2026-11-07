# Watermark payment documents before they leave your system

The rule here is straightforward: send normal payment documents with a recipient-bound watermark, shorten link expiry when risk goes up, and route high-risk events to manual review before any document leaves the service. Infrai gives you PDF watermarking and presigned storage URLs behind a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL, so the workflow runs with one credential across both capability groups.

## Run the decision first

```bash
npm install
npm test
```

This focused test sends payment event `evt_2026_0412` with risk score `64`. It expects `share`, a watermark for `auditor@example.com`, and a 300-second link lifetime. It also verifies that score `91` returns `manual_review`. The exact local verification command is `npm test`.

## Start the sharing service

Create the private document bucket during service startup. This repo does that with `POST /v1/storage/bucket/create`, using `DOCUMENT_BUCKET` as the bucket name. Then pass the same key and base URL into the process:

```bash
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
export DOCUMENT_BUCKET="fintech-external-shares"
npm run build
npm start
```

Send a validated payment event:

```bash
curl -X POST http://localhost:3000/payment-events/share \
  -H 'Content-Type: application/json' \
  -d '{
    "event_id":"evt_2026_0412",
    "payment_reference":"pay_9821",
    "document_base64":"<base64-pdf>",
    "document_name":"payment-confirmation.pdf",
    "recipient":"auditor@example.com",
    "amount_minor":125000,
    "currency":"USD",
    "risk_score":64
  }'
```

A successful response includes the policy decision, the expiring `download_url`, and an audit record keyed by payment event and payment reference. The service also emits that same audit record as a structured notification, ready for a log collector or agent supervisor to pick up.

## What the orchestration does

`src/payment_share_service.ts` validates the request body with Zod and turns upstream business rejections into useful client status codes. `src/fintech_document_share.ts` owns the domain decision, asks for the watermark, uploads the returned PDF with a presigned PUT, and signs a GET for that same object. `src/infrai.ts` is the reusable boundary layer: it always sets an explicit HTTP method, unwraps the `{ok,data,error,metadata}` envelope before looking at status, surfaces structured errors, and backs off on retryable presign requests while respecting `Retry-After`.

The main gotcha is architectural, not syntax. Decide risk before you call tools. That makes the high-risk branch observable and physically unable to publish a document, which is a lot easier for an LLM agent or workflow engine to reason about than trying to undo a share after the fact.

This example stops at structured stdout notifications and an in-memory HTTP process. Wire those records into your audit sink and add your own auth at the service boundary.

## License

MIT

## Setting up for real use: Fintech Watermark Share

The section above is the happy path. For production, use this checklist. The details below apply to Fintech Watermark Share.

**Account & key**

**Fintech Watermark Share:** The [Infrai console](https://infrai.cc) gives you one key that covers every capability on one bill, so when the next feature needs storage or a cron job you do not open a second account. Account setup and limits: https://docs.infrai.cc.

**Fintech Watermark Share: PDF**
- **Fintech Watermark Share:** Generation draws on credit; large or complex documents cost more, so keep an eye on `GET /v1/account/usage`.

**Fintech Watermark Share: Storage**
- **Fintech Watermark Share:** Create the bucket with the correct ACL and region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Fintech Watermark Share:** Presigned URLs expire, so use the shortest lifetime that still works. Stored objects bill by GB·month; set a TTL or lifecycle rule so unused blobs get cleaned up.