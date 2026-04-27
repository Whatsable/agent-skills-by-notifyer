---
name: automate-notifyer
description: >
  Build automation infrastructure on a Notifyer by WhatsAble account — manage WhatsApp
  message templates, create and configure AI bots for automated chat handling, create
  and schedule bulk WhatsApp broadcast campaigns, retrieve messaging analytics and
  message delivery logs, and manage developer webhooks (n8n / Make / Zapier integrations)
  and IO webhooks (bidirectional incoming & outgoing). Use this skill after setup-notifyer
  has been completed (account authenticated, WhatsApp number connected).
  Requires NOTIFYER_API_TOKEN from login.js.
license: Proprietary — © WhatsAble. All rights reserved.
compatibility: Requires Node.js >= 18. Set NOTIFYER_API_BASE_URL and NOTIFYER_API_TOKEN environment variables before running any script.
metadata:
  author: whatsable
  version: "0.3.0"
  product: Notifyer by WhatsAble
  api-base: https://api.insightssystem.com
  depends-on: setup-notifyer
---

# automate-notifyer

Scripts for building automation infrastructure — templates, AI bots, broadcasts,
analytics, and webhooks — on a Notifyer account via the Console API (`https://api.insightssystem.com`).
All Console API requests authenticate with `Authorization: Bearer <token>`.

> **Prerequisite:** Run `setup-notifyer` first. You need an authenticated session
> (`NOTIFYER_API_TOKEN`), a connected WhatsApp number, and (for bots/broadcasts) a
> Pro or Agency subscription.

## Setup

```bash
cd skills/automate-notifyer
npm install          # no dependencies required (uses built-in fetch)
```

Set environment variables:

```bash
export NOTIFYER_API_BASE_URL="https://api.insightssystem.com"
export NOTIFYER_API_TOKEN="<jwt-token>"   # from setup-notifyer/scripts/login.js
```

## How-to

### Templates

```bash
node scripts/list-templates.js --status approved --pretty   # broadcast-ready templates
node scripts/list-templates.js --category MARKETING
node scripts/get-template.js --name order_confirmation      # fetch by name, id, or whatsapp-id
node scripts/create-template.js \
  --name order_confirmation --category MARKETING \
  --body "Hello {{1}}, your order #{{2}} is confirmed." --variables '{"1":"John","2":"12345"}'
node scripts/create-template.js --name promo_banner --category MARKETING \
  --body "Check out our offer!" --type image --media-url "https://example.com/banner.jpg"
node scripts/create-template.js --name verify_login --category AUTHENTICATION --expiry 10
node scripts/delete-template.js --id 987654321 --confirm    # whatsapp_template_id from list-templates.js
```

Template names: lowercase, underscores only, cannot start with a digit.
Status: `"approved"` (ready), `"PENDING"` (review), `"rejected"` (recreate with new name).
After creating, poll `get-template.js --name <name>` to check status.
**Note on deletion:** `delete-template.js` guards against deleting `REJECTED` templates — Meta removes them from their side, making the delete API call fail with a 400. The script detects this status upfront and exits with a clear error instead of hitting the API. Only `APPROVED` templates can be deleted.
See `references/templates-reference.md` for full field reference.

### AI Bots

```bash
node scripts/list-bots.js --pretty
node scripts/get-bot.js --id 12 --pretty
node scripts/create-bot.js --name "Support Bot" \
  --mission "Help users resolve support issues." \
  --knowledge-base "Return policy: 30 days. Shipping: 3-5 days." \
  --tone "Friendly" --delay 3 \
  --trigger-keywords "agent,human" --notification --default
node scripts/update-bot.js --id 12 --tone "Professional" --delay 5
node scripts/update-bot.js --id 12 --knowledge-base "Updated FAQ content."
node scripts/set-default-bot.js --id 12 --pretty
node scripts/delete-bot.js --id 12 --confirm --pretty
```

> **Plan requirement:** AI Bots require Pro or Agency plan — check with `setup-notifyer/get-user-plan.js`.
> **OpenAI dependency:** Workspace must have a valid OpenAI API key configured in Notifyer settings.
> See `references/bots-reference.md` for file-based knowledge base and full field reference.

### Broadcasts

```bash
node scripts/list-broadcasts.js --status upcoming --pretty
node scripts/list-broadcasts.js --status previous          # completed
node scripts/get-broadcast.js --id 5 --pretty
node scripts/create-broadcast.js \
  --name "January Sale" --template-id 42 \
  --test-phone "+14155550123" \
  --recipients ./recipients.csv \
  --schedule "25/01/2025 14:00" \
  --delivery-mode smart --delivery-size 4 --read-rate 95
node scripts/delete-broadcast.js --id 5 --confirm          # cancel upcoming broadcast
```

`create-broadcast.js` runs 3 sequential API steps: test send → upload CSV → schedule.
CSV format: `phone_number,body1,body2` — phone numbers WITHOUT `+`.
Delivery modes: `smart` (auto-paced), `regular` (fixed batches), `risk` (no batching).
See `references/broadcasts-reference.md` for full 3-step flow detail.

### Analytics & Logs

```bash
node scripts/get-message-analytics.js --days 30 --pretty
node scripts/get-message-analytics.js --from 2025-01-01 --to 2025-01-31
node scripts/get-message-logs.js --filter broadcast --phone 14155550123 --pretty
node scripts/get-message-logs.js --filter automation --page 2 --per-page 10
```

Analytics returns: `total_sent`, `sent_count`, `delivered_count`, `read_count`, `read_rate`, `delivery_rate`.
Logs filter by `broadcast` or `automation`; pagination is client-side.
See `references/analytics-reference.md` for field reference.

### Webhooks

```bash
node scripts/list-webhooks.js --type dev --pretty
node scripts/list-webhooks.js --type io --pretty
node scripts/create-webhook.js --url "https://hook.eu2.make.com/abc" --incoming --outgoing --signature
node scripts/create-webhook.js --type io --url "https://myapp.com/wh" --signature
node scripts/update-webhook.js --id 5 --status false            # pause dev webhook
node scripts/update-webhook.js --type io --id "abc" --url "https://new-url.com"
node scripts/delete-webhook.js --id 5 --confirm
node scripts/delete-webhook.js --type io --id "abc" --confirm
```

`--signature` generates an HMAC secret — **save it immediately**, not retrievable later.
Dev webhook `id` is integer; IO webhook `id` is text UUID.
See `references/webhooks-reference.md` for full field reference and CORS/auth details.

## Rules

### Templates

- **`list-templates.js` auto-syncs PENDING statuses** — every call to
  `GET /api:AFRA_QCy/templates_web` loops over all PENDING templates, calls the Meta API
  for each one, and saves the updated status. The returned list is always live. No manual
  polling is needed — just call `list-templates.js` ~60 seconds after creating a template.
- **`create-template.js` response is the Meta API response** — the create endpoint returns
  `var:request_hit_into_whatsapp`, which is the raw WhatsApp Business API response (not a
  Notifyer internal record). The template is only stored in Notifyer's DB if Meta accepted it.
  If Meta rejects the payload, the template will not appear in `list-templates.js`.
- **Templates require Meta approval** — every template submitted via `create-template.js`
  starts as `"PENDING"` (uppercase, as Xano stores it). Meta typically approves within
  60 seconds. A `"rejected"` template cannot be edited; create a new one with a different
  name and revised content.
- **Template names are permanent** — once submitted to Meta, the name cannot be changed.
  Use snake_case (lowercase, underscores, no leading digit), e.g. `order_confirmation`.
- **Body variables need example values** — `--variables '{"1":"John","2":"12345"}'` is
  required for any body that contains `{{N}}` placeholders. Meta requires realistic sample
  values during review. Missing examples will cause `create-template.js` to error before submitting.
- **Media must be pre-uploaded** — for image/document/video templates, pass a public URL via
  `--media-url`. The script calls `GET /api:ox_LN9zX/get_file_base46_encode` automatically.
  The returned `handle` is used as `mediaUrl` in the create payload, not the original URL.
- **AUTHENTICATION body is auto-generated** — do not pass `--body` for AUTHENTICATION
  templates. Xano generates the body from the OTP code, expiry, and security recommendation.
- **Two template list endpoints** — `templates_web` returns ALL templates; `templates_broadcast_web`
  returns only `approved` templates. Use `list-templates.js --status approved` for the same result.
- **No GET-by-ID for templates** — `get-template.js` always fetches the full list and filters
  client-side.
- **`whatsapp_template_id` is needed for deletion** — the DELETE endpoint takes Meta's numeric
  `whatsapp_template_id`, not Notifyer's string `template_id`. Use `get-template.js` to look
  it up before deleting.
- **Duplicate template name returns 400** — `create-template.js` maps this to
  `{ ok: false, error: "A template named '...' already exists.", blocked: true }`.

### AI Bots

- **AI Bots require Pro or Agency plan** — on Basic plan the workspace has no OpenAI API key
  configured, so `create-bot.js` will always fail (OpenAI returns non-200). Verify with
  `setup-notifyer/scripts/get-user-plan.js` before directing a user to create bots.
- **`create-bot.js` calls OpenAI internally** — Xano's `POST /ai_config` calls
  `POST https://api.openai.com/v1/assistants` before saving the bot. Both success and failure
  return HTTP 200. The script detects failure by checking if `response.bot_name` exists
  (bot saved) or is missing (OpenAI error log returned instead).
- **No duplicate bot name check** — unlike labels and templates, bots have no precondition
  for duplicate names. Multiple bots with the same `bot_name` are allowed.
- **`GET /ai_config` returns a direct array** — the list endpoint returns a plain JSON array
  (not `{ items: [], count: n }`). `list-bots.js` normalises this into `{ bots, count }`.
- **`GET /ai_config/:id` fires 400 for missing bots** — Xano uses a Precondition
  (`var:model != null`) to guard the GET-by-ID endpoint. HTTP 400 means "not found",
  not a server error. `get-bot.js` maps this to a user-friendly message.
- **`set-as-default` requires Admin or Super Admin** — `PATCH /ai_config/set-as-default/:id`
  has an explicit role Precondition. Team Members are blocked (HTTP 400). Use an Admin token.
- **`set-as-default` is mutually exclusive** — Xano loops ALL bots and sets every bot's
  `default` flag: `true` for the target, `false` for all others. Only one bot can be default.
- **PATCH (update) also calls OpenAI** — `PATCH /ai_config/:id` re-syncs with OpenAI
  (`PATCH /v1/assistants/:id`). If OpenAI returns non-200, the update fails with HTTP 400
  (Precondition). The PATCH response is the OpenAI API response, not the updated bot record.
- **File upload is a public endpoint** — `POST /ai_config/files` has no Xano auth gate
  (Public Endpoint), but the frontend still sends `Bearer` token. Maximum file size is
  exactly 10,000,000 bytes (10 MB). Response is the Xano attachment metadata object.
- **Bot assignment happens via recipient update** — to assign a bot to a WhatsApp conversation
  in chat, update the recipient record: `PATCH /recipient/:id` with `{ ai_bot_id: <bot_id> }`.
  The chat app fetches bots using **chat auth** (raw token, no Bearer prefix).

### Analytics

- **`anslytics` is the real endpoint path** — the Xano path is `GET /api:5l-RgW1B/anslytics` (typo is in the backend). Do not "correct" the spelling — the request will 404.
- **`start_timestamp` and `end_timestamp` are text, not integers** — Xano types them as text but expects Unix millisecond values. Pass as strings (e.g. `String(Date.now())`).
- **`total_sent` vs `sent_count`** — `total_sent` = all messages attempted; `sent_count` = confirmed sent by Meta. These differ when sends fail at the Meta layer. Always check `total_sent` for volume, `sent_count` for confirmed delivery pipeline entry.
- **`read_rate` and `delivery_rate` are script-calculated** — Xano does not return these. They are added by `get-message-analytics.js` as `read_count / total_sent` and `delivered_count / total_sent`.
- **No date filter on logs** — `GET /api:ereqLKj6/log` does not accept timestamp parameters. Use `get-message-analytics.js` for time-windowed counts; use `get-message-logs.js` only for per-message detail (filtered by phone and/or type).
- **Log endpoint requires CORS header** — `GET /api:ereqLKj6/log` runs `/cors_origin_console` as its first step. `get-message-logs.js` sends `Origin: https://console.notifyer-systems.com` automatically.
- **`phone_number` for logs is integer** — pass without `+` prefix. `get-message-logs.js` strips `+` automatically. Omit `--phone` entirely to get all phones.
- **Log pagination is client-side** — Xano returns the full array. Use `--page` and `--per-page` in `get-message-logs.js`; defaults are page 1, 20 per page.
- **Download endpoint returns CSV, not JSON** — `GET /api:5l-RgW1B/download/analytics/details` sets `Content-Type: text/csv`. Use raw `fetch` + `response.text()`. See `references/analytics-reference.md` for a code sample.
- **Analytics are read-only** — no write or delete operations exist in either analytics API group.

### Broadcasts

- **All broadcast endpoints require `Origin: https://console.notifyer-systems.com` header** —
  every `/api:6_ZYypAc` endpoint runs `/cors_origin_console` as its first step. Scripts
  send this header automatically via `extraHeaders`.
- **Broadcasts are a 3-step process** — `create-broadcast.js` handles all three steps:
  (1) `POST /broadcast_test` → initialises record + sends test message,
  (2) `POST /broadcast_user_recipient_numbers` → uploads recipient CSV (multipart),
  (3) `POST /broadcast_schedule` → finalises delivery settings.
  The three steps are linked by a `broadcast_identifier` UUID generated client-side.
- **Step 1 sends a real WhatsApp message** — `broadcast_test` delivers an actual test
  message to `--test-phone`. Always use a number you can verify. The test is mandatory
  because it creates the `broadcast_schedule` record that steps 2 and 3 update.
- **Schedule string is timezone-sensitive** — Xano does an IP Address Lookup to resolve
  the caller's timezone. `"25/01/2025 14:00"` means 2:00 PM in the timezone of the
  machine running the script. Verify the scheduled time in the console after scheduling.
- **Schedule format is strictly `DD/MM/YYYY HH:mm`** — ISO 8601 is not accepted. Example:
  `"25/01/2025 14:00"`. The script validates this format before calling the API.
- **Risk mode has no batching** — `delivery_mode: "risk"` sends all messages at once.
  Do not pass `--delivery-size` for risk mode. Use only for small, urgent audiences — large
  risk sends can trigger Meta's spam detection and disable the WhatsApp number.
- **Recipient CSV is re-uploadable** — uploading a new CSV to the same `broadcast_identifier`
  automatically deletes the previous recipient list before processing the new one.
- **Phone numbers in CSV must NOT include `+`** — Xano parses numbers from the CSV
  and formats them internally. Pass `14155550101` not `+14155550101`.
- **`GET /download` returns CSV, not JSON** — use raw `fetch` with `response.text()`
  or `response.blob()` for the download endpoint. `required` values: `"success"`,
  `"fail"`, `"on_queue"`.
- **`DELETE /broadcast/:id` cascades** — deleting a broadcast also bulk-deletes all
  associated recipient phone numbers from `user's_recipient_phone_numbers`.
- **`DELETE /broadcast/:id` has no user auth check** — the delete endpoint does not
  call `/get_user`. Auth relies on the CORS origin check only. Use with caution.
- **`broadcast_test` returns HTTP 200 even on failure** — check `response.success`.
  If `false`, inspect `response.whatsapp_response_info.error_data.details` for the
  Meta error message. `create-broadcast.js` detects and surfaces this automatically.
- **`get-broadcast.js` searches all 3 status groups** — there is no GET-by-ID endpoint.
  The script fetches upcoming, previous, and ongoing in sequence and returns the first
  match. Use `--status` to restrict to a single group for faster lookups.

### Webhooks

- **Two distinct webhook systems** — "Dev webhooks" (`zapier_make_webhooks` table) are for
  outbound automation triggers to n8n, Make, or Zapier. "IO webhooks"
  (`webhook_incoming_and_outgoing` table) are for bidirectional real-time data pipelines.
  They have different fields, data types, and CORS rules.
- **Dev webhook endpoints ALL require `Origin: https://console.notifyer-systems.com`** —
  Xano runs `/cors_origin_console` as step 1 on every `/webhook/dev/*` endpoint. Scripts
  send this header automatically.
- **IO webhook endpoints do NOT require a CORS header** — none of the `/user/io/webhook`
  endpoints run `/cors_origin_console`. Do not add Origin header to IO webhook calls.
- **Dev webhook id is integer; IO webhook id is TEXT** — never cast an IO webhook id to
  an integer. Store and pass it as a string. The `update-webhook.js` and `delete-webhook.js`
  scripts handle this automatically based on `--type`.
- **Duplicate URL check (dev only)** — `create-webhook.js --type dev` will return
  `{ ok: false, blocked: true }` if a dev webhook with the same URL already exists
  (Xano Precondition: `same_exist == false`, HTTP 400).
- **`DELETE /webhook/dev/:id` is a PUBLIC ENDPOINT in Xano** — Xano marks this endpoint
  as Public with only a CORS check and no `/get_user` call. `delete-webhook.js` mitigates
  this at the script level: it first calls `GET /webhook/dev` (fully authenticated) to list
  the account's webhooks, then verifies the requested ID belongs to the authenticated account
  before allowing the delete. An attacker with only a webhook ID but no valid token cannot
  use this script to delete a webhook. The raw API endpoint itself remains unauthenticated —
  this is a Xano backend issue.
- **IO DELETE is fully authenticated** — unlike dev webhook delete, IO webhook delete
  (`DELETE /user/io/webhook`) does run `/get_user`. It is safe.
- **HMAC signature secret is shown only once** — when `--signature` is passed, Xano's
  "Create Secret Key" generates an HMAC secret and stores it in `signature_secret`. The
  value is returned in the create response. There is no GET endpoint that exposes it again.
  Store it securely immediately.
- **`IO DELETE` returns a string `"true"` not boolean** — Xano's Return step explicitly
  encodes `{ "success": "true" }`. Do not compare `=== true`; compare `=== "true"` or
  check truthiness with `!!response.success`.
- **IO PATCH `webhook` field is singular** — the PATCH body for IO webhooks uses `webhook`
  (singular) while the GET response field is named `webhooks` (plural). The `update-webhook.js`
  script normalises this automatically.
- **Feature toggle is separate** — `PATCH /user/incoming_outgoing/feature/status` with
  `{ is_incomingOutgoing_active: bool }` globally enables/disables the IO webhook feature
  for the account. Individual IO webhook `status` flags are independent of this global toggle.
  Both must be true for an IO webhook to receive events.
- **`waiting_duration` is in seconds (integer)** — used only when `schedule_activity: true`.
  Pass `--waiting-duration 3600` for a 1-hour wait. Passing it with `schedule_activity: false`
  is harmless but meaningless.
- **Update uses fetch-then-patch** — both `update-webhook.js` types call the list endpoint
  first, find the current record by id, merge your overrides, and send the full object.
  This is required because Xano's "Add Or Edit Record" function expects a complete record.

## API group IDs

Notifyer's backend uses Xano-style API group IDs in the URL path:

| Group | Prefix | Used for |
|-------|--------|----------|
| AI Config | `/api:Sc_sezER` | Bots (list, create, get, update, delete, set-as-default, file upload) |
| Templates | `/api:AFRA_QCy` | Template create, list, delete |
| Media Upload | `/api:ox_LN9zX` | Pre-upload media files for non-text templates |
| Broadcasts | `/api:6_ZYypAc` | Broadcast test, recipient upload, schedule, list, delete, download |
| Analytics | `/api:5l-RgW1B` | Analytics summary, CSV download, single conversation record |
| Message Logs | `/api:ereqLKj6` | Message log listing (requires CORS origin header) |
| Developer/IO Webhooks | `/api:qh9OQ3OW` | Dev webhooks (Make/n8n/Zapier), IO webhooks, feature toggle, manual phone registration |

## Scripts

<!-- FILE MAP START -->
| File | Description |
||------|-------------|
|| `scripts/lib/notifyer-api.js` | Base HTTP client — loads config, sends requests, handles errors |
|| `scripts/lib/args.js` | CLI argument parser (flags, booleans, numbers) |
|| `scripts/lib/result.js` | Standard output helpers — `ok()`, `err()`, `printJson()` |
|| `scripts/list-templates.js` | `GET /api:AFRA_QCy/templates_web` — list all workspace templates with optional status/category/type filters |
|| `scripts/get-template.js` | fetch-then-filter — retrieve a single template by name, template_id, or whatsapp_template_id |
|| `scripts/create-template.js` | `POST /api:AFRA_QCy/create` — submit a template for Meta approval (handles media pre-upload internally) |
|| `scripts/delete-template.js` | `DELETE /api:AFRA_QCy/templates/delete` — permanently delete a template from Notifyer and Meta (--confirm required) |
|| `scripts/list-bots.js` | `GET /api:Sc_sezER/ai_config` — list all AI bots in the workspace |
|| `scripts/get-bot.js` | `GET /api:Sc_sezER/ai_config/:id` — retrieve a single AI bot by numeric ID |
|| `scripts/create-bot.js` | `POST /api:Sc_sezER/ai_config` — create an AI bot (internally creates an OpenAI Assistant) |
|| `scripts/update-bot.js` | `PATCH /api:Sc_sezER/ai_config/:id` — update bot fields (name, mission, tone, delay, etc.); re-syncs OpenAI Assistant |
|| `scripts/delete-bot.js` | `DELETE /api:Sc_sezER/ai_config/:id` — permanently delete a bot and its OpenAI Assistant (--confirm required) |
|| `scripts/set-default-bot.js` | `PATCH /api:Sc_sezER/ai_config/set-as-default/:id` — set one bot as the workspace default (unsets others) |
|| `scripts/list-broadcasts.js` | `GET /api:6_ZYypAc/broadcast?require=…` — list broadcasts by status: upcoming, previous, or ongoing |
|| `scripts/get-broadcast.js` | fetch-then-filter — retrieve a single broadcast by id, name, or broadcast_identifier |
|| `scripts/create-broadcast.js` | 3-step flow: broadcast_test → upload CSV → broadcast_schedule — create and schedule a broadcast |
|| `scripts/delete-broadcast.js` | `DELETE /api:6_ZYypAc/broadcast/:id` — cancel/delete a broadcast (--confirm required; messages already sent not recalled) |
|| `scripts/get-message-analytics.js` | `GET /api:5l-RgW1B/anslytics` — analytics summary (total sent, delivered, read, rates) for a date range |
|| `scripts/get-message-logs.js` | `GET /api:ereqLKj6/log` — message logs with optional phone and type filter; client-side pagination |
|| `scripts/list-webhooks.js` | `GET /api:qh9OQ3OW/webhook/dev` or `/user/io/webhook` — list dev or IO webhooks (--type dev|io) |
|| `scripts/create-webhook.js` | `POST /webhook/dev/create` or `/user/io/webhook` — create a webhook with triggers, signature key, and status |
|| `scripts/update-webhook.js` | `PATCH /webhook/dev/:id` or `/user/io/webhook` — fetch-then-patch update for URL, status, triggers |
|| `scripts/delete-webhook.js` | `DELETE /webhook/dev/:id` or `/user/io/webhook` — permanent delete with --confirm safety gate |
<!-- FILE MAP END -->

## References

- `../../AUTHENTICATION.md` — **All three auth surfaces** (Console/Chat/Developer) with curl examples, decision guide, and error diagnostics
- `references/templates-reference.md` — Template data model, all endpoints, name rules, categories, media upload, button shapes, status lifecycle, body variables
- `references/bots-reference.md` — AI Bot data model, all CRUD endpoints, OpenAI integration, file upload, set-as-default, plan requirements, bot-assignment in chat
- `references/broadcasts-reference.md` — Full 3-step broadcast workflow, all `/api:6_ZYypAc` endpoints, data model, delivery modes, CSV format, timezone handling, download endpoint
- `references/analytics-reference.md` — Analytics summary and log API endpoints, response shapes, date range conventions, download CSV usage, limitations
- `references/webhooks-reference.md` — Dev webhook and IO webhook full API reference: all endpoints, data types, CORS rules, id type differences, HMAC signature keys, feature toggle, manual phone registration

## Assets

- `assets/recipients-example.csv` — Example recipient CSV for `create-broadcast.js` showing all column names and phone number format (no `+` prefix)
- `assets/template-create-example.json` — Example payloads for `create-template.js` — text with variables, image with buttons, and AUTHENTICATION type
- `assets/broadcast-create-example.json` — CLI flag reference and success response shape for `create-broadcast.js`, plus delivery mode and CSV rules

## Limitations

- **Template approval by Meta takes 24–72 hours.** `create-template.js` submits the template to Meta. It cannot be used for messaging until status changes from `PENDING` to `APPROVED`. This cannot be expedited via API.
- **Templates cannot be edited after approval.** If changes are needed, create a new template with a different name. There is no update-template script (Meta does not allow editing approved templates).
- **Deleted template names cannot be reused for 30 days.** Meta enforces a 30-day cooldown after deletion. `delete-template.js` requires the numeric `whatsapp_template_id`, not the string `template_id`.
- **`delete-broadcast.js` cannot recall messages already sent.** It stops future batches but messages dispatched before deletion are delivered. Only use it on upcoming (not yet started) broadcasts.
- **AI Bot creation requires an OpenAI API key configured in Notifyer settings.** `create-bot.js` will fail if the workspace has no valid OpenAI key. This is set in the Notifyer console, not via script.
- **Broadcast CSV recipients must use integer phone numbers (no `+` prefix).** The Xano broadcast endpoint rejects formatted phone strings.
- **Analytics data may have a reporting delay.** `get-message-analytics.js` reflects data as processed by Notifyer's backend — real-time counts may differ slightly.
- **Message logs (`get-message-logs.js`) only cover automation and broadcast sends.** Chat messages sent manually or via `chat-notifyer` scripts are not in this log. Use `chat-notifyer/get-conversation-log.js` for those.
- **IO webhook `id` is a text UUID, not an integer.** Unlike dev webhook IDs. All IO webhook scripts handle this correctly — but external tools must treat the ID as a string.
- **`DELETE /webhook/dev/:id` is a public endpoint in Xano (no server-side user auth check).** `delete-webhook.js` adds an ownership verification step (authenticated `GET /webhook/dev` first) to block use against webhooks not belonging to the authenticated account. The raw API endpoint remains unauthenticated — a Xano-side fix is still recommended.
- **IO webhook global feature toggle has no dedicated script.** `PATCH /api:qh9OQ3OW/user/incoming_outgoing/feature/status` (`{ is_incomingOutgoing_active: bool }`) globally enables or disables the IO webhook feature for the entire account. If IO webhooks are not firing, verify this flag is enabled in the Notifyer console settings. Both the global toggle AND the individual webhook's `status` flag must be `true` for events to fire.
- **Broadcast, analytics, and recipients CSV downloads are not covered by these scripts.** `GET /api:6_ZYypAc/download` (broadcast report), `GET /api:5l-RgW1B/download/analytics/details` (analytics export), and `GET /api:bVXsw_FD/recipient_download_csv` all return binary CSV streams (`Content-Type: text/csv`). They cannot be consumed by the JSON-based scripts here — use raw `fetch` with `response.text()` or `response.blob()` directly in a custom workflow.
- **Pipedrive and Monday CRM integrations are browser-only OAuth flows.** The `/api:MLBAaPmt/pipedrive/...` and `/api:2qGGG8pe/monday/...` API groups require OAuth token exchange via browser redirect. There are no scripts for these integrations in this skill set.

<!-- FILEMAP:BEGIN -->
```text
[automate-notifyer file map]|root: .
||.:{package.json,SKILL.md}
||assets:{broadcast-create-example.json,recipients-example.csv,template-create-example.json}
||references:{analytics-reference.md,bots-reference.md,broadcasts-reference.md,templates-reference.md,webhooks-reference.md}
||scripts:{create-bot.js,create-broadcast.js,create-template.js,create-webhook.js,delete-bot.js,delete-broadcast.js,delete-template.js,delete-webhook.js,get-bot.js,get-broadcast.js,get-message-analytics.js,get-message-logs.js,get-template.js,list-bots.js,list-broadcasts.js,list-templates.js,list-webhooks.js,set-default-bot.js,update-bot.js,update-webhook.js}
||scripts/lib:{args.js,notifyer-api.js,result.js}
```
<!-- FILEMAP:END -->