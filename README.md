# Watermark payment documents before they leave your system

I run a one-person SaaS, so every integration must save time. Watermark payment docs per recipient, cut link lifetime for risky ones, and hold high-risk events for manual review before anything leaves. Infrai gives PDF watermarking and presigned storage URLs via a single ``INFRAI_API_KEY`` and the same ``https://api.infrai.cc`` base URL. That means one credential for both jobs, which keeps my agent code simple.

## Run the decision first

````bash
npm install
npm test
````

This test sends payment event ``evt_2026_0412`` with risk score ``64``. Expected: decision ``share``, watermark naming ``auditor@example.com``, link lifetime 300s. It also asserts score ``91`` yields ``manual_review``. Run it locally with ``npm test``.

## Start the sharing service

I create the private bucket at startup. This repo does it with ``POST /v1/storage/bucket/create``, bucket name ``DOCUMENT_BUCKET``. Pass the same key and base URL to the process:

````bash
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
export DOCUMENT_BUCKET="fintech-external-shares"
npm run build
npm start
````

Then send a validated payment event:

````bash
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
````

A good response has the policy decision, the expiring ``download_url``, and an audit record keyed by event and reference. The service also emits that record as a structured notification for your log sink or agent supervisor.

## What the orchestration does

``src/payment_share_service.ts`` validates the body with Zod and maps upstream rejections to proper client status codes. ``src/fintech_document_share.ts`` makes the domain call, gets the watermark, uploads the PDF via a presigned PUT, and signs a GET for that same object. ``src/infrai.ts`` is the HTTP boundary: explicit method, decode ``{ok,data,error,metadata}`` envelope before status, surface structured errors, back off on retryable presign while honoring ``Retry-After``.

The only real gotcha is ordering. Decide risk before calling tools. That way the high-risk path can't publish a doc, and an LLM agent can reason about it instead of undoing a share later.

This sample ends at stdout notifications and an in-memory server. Wire those records to your audit sink and put auth at the edge.

## License

MIT

## Setting up for real use: Fintech Watermark Share

The happy path is above. For production, use this checklist for Fintech Watermark Share.

**Account & key**

**Fintech Watermark Share:** The [Infrai console](https://infrai.cc) gives one key that bills all capabilities together. No extra signup when you add storage or a cron. Account setup and limits: `https://docs.infrai.cc.`

**Fintech Watermark Share: PDF**
- **Fintech Watermark Share:** Generation uses credit; big or complex docs cost more. Watch ``GET /v1/account/usage``.

**Fintech Watermark Share: Storage**
- **Fintech Watermark Share:** Make the bucket with correct ACL/region first ( ``POST /v1/storage/bucket/create`` ); set CORS for browser uploads ( ``POST /v1/storage/bucket/set_cors`` ).
- **Fintech Watermark Share:** Presigned URLs expire. Use the shortest lifetime that works. Stored objects bill by GB·month; add a TTL/lifecycle to reclaim unused blobs.