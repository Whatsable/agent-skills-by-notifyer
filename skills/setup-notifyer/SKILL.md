---
name: setup-notifyer
description: >
  Create and manage a Notifyer by WhatsAble account — signup, login, retrieve the
  authenticated user, check WhatsApp connection status, manage subscription plans,
  manage team members, assign roles, configure workspace labels, manage WhatsApp
  message templates, create and manage AI bots, and create and manage WhatsApp
  broadcasts. Use this skill any time you need to authenticate against the Notifyer
  Console API, set up a new workspace, prepare templates, configure AI bots for
  automated chat handling, or schedule a bulk WhatsApp broadcast campaign.
license: Proprietary — © WhatsAble. All rights reserved.
compatibility: Requires Node.js >= 18. Set NOTIFYER_API_BASE_URL and NOTIFYER_API_TOKEN environment variables before running any script.
metadata:
  author: whatsable
  version: "0.4.0"
  product: Notifyer by WhatsAble
  api-base: https://api.insightssystem.com
---

# setup-notifyer

Scripts for managing a Notifyer account via the Console API
(`https://api.insightssystem.com`). All Console API requests authenticate with
`Authorization: Bearer <token>`.

## Setup

```bash
cd skills/setup-notifyer
npm install          # no dependencies required yet (uses built-in fetch)
```

Set environment variables:

```bash
export NOTIFYER_API_BASE_URL="https://api.insightssystem.com"
export NOTIFYER_API_TOKEN="<jwt-token>"   # from login.js
```

## How-to

### List available subscription plans

```bash
node scripts/list-plans.js                           # all plans
node scripts/list-plans.js --billing monthly         # monthly only
node scripts/list-plans.js --billing annual          # annual only
node scripts/list-plans.js --tier pro                # Pro tier only
node scripts/list-plans.js --tier basic --billing monthly
node scripts/list-plans.js --pretty                  # human-readable table to stderr
```

Returns all plan tiers grouped by `{ monthly: { basic, pro, agency }, annual: { ... } }`.
Each tier entry contains `id`, `price` (in dollars), `unique_numbers` (contact limit),
`stripe_price_id`, and `What_it_includes`.

Plans: `basic` = Bulk Message (no integrations/bots), `pro` = full features,
`agency` = Pro + multiple phone numbers.

### Get current subscription and usage

```bash
node scripts/get-user-plan.js
node scripts/get-user-plan.js --pretty
```

Returns `{ usages, latest_plan: { status, plan_amount, unique_number_limit,
total_unique_number_count, end_time, ... } }`.
`plan_amount` is in **cents** — the script adds a `plan_amount_dollars` convenience field.

### Check WhatsApp connection status

```bash
node scripts/get-connection-status.js
node scripts/get-connection-status.js --pretty   # human-readable summary to stderr
```

Returns `{ ok: true, data: { isConnected, has_embedded_user, registration, subscription,
payment_method_added, is_template_has, is_message_tested, is_profile_picture_added,
onboarding_steps_completed } }`.

`isConnected = true` means the phone number has both successful Meta registration and
subscription — it is ready to send messages.

### Force-refresh WhatsApp registration status with Meta

Use this when `get-connection-status.js` shows a failed or stale registration/subscription,
or after connecting a new number in the console.

```bash
node scripts/refresh-connection.js
node scripts/refresh-connection.js --pretty
```

Returns the same shape as `get-connection-status.js`.

> **Daily limit warning:** Meta limits how many times per day re-registration can be
> attempted. If the response indicates a limit error, wait 24 hours before retrying.

### List team members

```bash
node scripts/list-members.js                         # all members
node scripts/list-members.js --page 1 --per-page 25 # paginate
node scripts/list-members.js --labels                # also show available label names
node scripts/list-members.js --pretty                # human-readable table to stderr
```

Returns `{ items: TeamMember[], team_seat: { included_seats } }`.
Members are sorted by role (Super Admin → Admin → Team Member (All Labels) → Team Member).

### Add a team member

```bash
node scripts/invite-member.js \
  --name "Jane Smith" \
  --email jane@company.com \
  --password "Secure@2024" \
  --role "Team Member" \
  --labels "Sales,Support"
```

Creates a full account immediately (no email invite flow). Share credentials out-of-band.
Assignable roles: `Admin`, `Team Member (All Labels)`, `Team Member`.
Labels (comma-separated) are only used for `Team Member` role — Admin roles get all labels automatically.

### Change role, labels, name, or password

```bash
# Promote to Admin
node scripts/update-member.js --id <id> --role Admin

# Assign new labels (replaces current list)
node scripts/update-member.js --id <id> --labels "Sales,VIP"

# Clear all labels
node scripts/update-member.js --id <id> --labels ""

# Rename + reset password
node scripts/update-member.js --id <id> --name "John Doe" --password "NewPass@99"
```

There is no separate `change-role` endpoint — role, labels, name and password are all
updated through the same `PATCH /api:-4GSCDHb/auth/user` call. The script auto-fetches
current values and only changes what you supply.

### Remove a team member

```bash
node scripts/remove-member.js --id <id> --confirm
```

Permanent and immediate. `--confirm` is required to prevent accidental deletion.
Super Admin (account owner) cannot be removed.

### Get the Developer API key

```bash
node scripts/get-api-key.js
node scripts/get-api-key.js --pretty   # prints key to stderr for easy copying
```

Returns `{ id, api_key, user_id, created_at }`.

The `api_key` value is the credential used by **Make, Zapier, n8n, and custom scripts**
to send messages via the developer API. It authenticates as a **raw `Authorization`**
header (no `Bearer` prefix) — different from `NOTIFYER_API_TOKEN`.

### List workspace labels

```bash
node scripts/list-labels.js
node scripts/list-labels.js --pretty   # human-readable table to stderr
```

Returns `{ labels: Label[], count: n }`.
Each label has `id`, `label` (display name), `keywords` (auto-assignment triggers),
`user_id`, and `created_at`.

> Super Admin and Admin see **all** workspace labels. Team Members see only the
> labels assigned to their account.

### Create a workspace label

```bash
node scripts/create-label.js --label "Sales"
node scripts/create-label.js --label "Support" --keywords "help,issue,ticket"
```

Label names must be unique. `keywords` are comma-separated trigger words that
auto-assign the label when a contact message contains a match.

### Update a label's name or keywords

```bash
# Add keywords
node scripts/update-label-keywords.js --id 5 --add "urgent,priority"

# Remove a keyword
node scripts/update-label-keywords.js --id 5 --remove "old-keyword"

# Replace the entire keyword list
node scripts/update-label-keywords.js --id 5 --set "buy,purchase,order"

# Clear all keywords
node scripts/update-label-keywords.js --id 5 --set ""

# Rename a label
node scripts/update-label-keywords.js --id 5 --label "VIP Customers"
```

`--add`, `--remove`, and `--set` are mutually exclusive. The script fetches the
current label first so unchanged fields are preserved.

### Delete a workspace label

```bash
node scripts/delete-label.js --id 5 --confirm
```

Permanent and immediate. `--confirm` is required to prevent accidental deletion.
After deletion, manually remove the label from any team members that had it
assigned using `update-member.js --labels`.

### List workspace templates

```bash
node scripts/list-templates.js
node scripts/list-templates.js --status approved     # broadcast-ready only
node scripts/list-templates.js --category MARKETING
node scripts/list-templates.js --type image
node scripts/list-templates.js --pretty              # human-readable table to stderr
```

Returns `{ templates: Template[], count: n }`.
Each template has `id`, `name`, `template_id`, `whatsapp_template_id`, `category`, `type`,
`body`, `language`, `status`, and `components`.

Status values: `"approved"` (ready to send), `"pending"` (under Meta review),
`"rejected"` (failed review — recreate with a different template).

### Get a single template

```bash
node scripts/get-template.js --name order_confirmation
node scripts/get-template.js --id tmpl_abc123
node scripts/get-template.js --whatsapp-id 123456789
node scripts/get-template.js --name order_confirmation --pretty
```

Internally calls `GET /api:AFRA_QCy/templates_web` and filters client-side.
Returns the matching template object, or `{ ok: false, error: "... not found." }`.

### Create a template

```bash
# Text template with body variables
node scripts/create-template.js \
  --name order_confirmation \
  --category MARKETING \
  --body "Hello {{1}}, your order #{{2}} is confirmed." \
  --variables '{"1":"John","2":"12345"}'

# Image template with auto media upload
node scripts/create-template.js \
  --name promo_banner \
  --category MARKETING \
  --body "Check out our latest offer!" \
  --type image \
  --media-url "https://example.com/banner.jpg"

# AUTHENTICATION template (body auto-generated by Xano)
node scripts/create-template.js \
  --name verify_login \
  --category AUTHENTICATION \
  --expiry 10

# With Quick Reply buttons
node scripts/create-template.js \
  --name survey_q1 \
  --category MARKETING \
  --body "Did you receive your order {{1}}?" \
  --variables '{"1":"#12345"}' \
  --buttons '[{"type":"Quick Reply","text":"Yes"},{"type":"Quick Reply","text":"No"}]'
```

Template names must be lowercase, use underscores (no spaces), and cannot start with a digit.
Meta reviews all templates — approval typically takes under 60 seconds.
After submission, poll with `get-template.js --name <name>` to check `status`.

For non-text types (`image`, `document`, `video`), pass a public media URL via
`--media-url`. The script auto-uploads it to get a handle before submitting.
Supported formats: PNG/JPG (image), MP4 (video), PDF (document).

### List broadcasts

```bash
node scripts/list-broadcasts.js                          # upcoming (default)
node scripts/list-broadcasts.js --status previous        # completed broadcasts
node scripts/list-broadcasts.js --status ongoing         # currently sending
node scripts/list-broadcasts.js --status upcoming --pretty
```

Returns `{ status, broadcasts: Broadcast[], count: n }`.
Each broadcast has `id`, `broadcast_name`, `template_name`, `unique_numbers`, `delivery_mode`,
`delivery_size`, `schedule` (Unix ms timestamp), `broadcast_identifier`, `cost_of_broadcast`,
`user_selected_read_rate`.
Previous and ongoing additionally include `delivery_success`, `delivery_fail`,
`message_send_count`, `message_read_count`, `batch_percentage`.

### Get a single broadcast

```bash
node scripts/get-broadcast.js --id 5
node scripts/get-broadcast.js --name "January Sale"
node scripts/get-broadcast.js --broadcast-id "uuid..."
node scripts/get-broadcast.js --id 5 --status previous --pretty

# Search within a specific status group (faster — 1 API call instead of 3):
node scripts/get-broadcast.js --id 5 --status upcoming
```

Searches across all three status groups (upcoming → previous → ongoing) unless `--status`
is provided. Returns `{ found_in, broadcast }` for the first match.
Returns `{ ok: false, error: "No broadcast found..." }` if no match.

### Create and schedule a broadcast (3-step flow)

A broadcast requires three sequential API calls linked by a shared `broadcast_identifier`
UUID. `create-broadcast.js` handles all three steps in one command.

```bash
# Smart delivery (batched, auto-paced)
node scripts/create-broadcast.js \
  --name "January Sale" \
  --template-id 42 \
  --test-phone "+14155550123" \
  --recipients ./recipients.csv \
  --schedule "25/01/2025 14:00" \
  --delivery-mode smart \
  --delivery-size 4 \
  --read-rate 95

# Regular batching
node scripts/create-broadcast.js \
  --name "Order Update" \
  --template-id 42 \
  --test-phone "+14155550123" \
  --variables '{"1":"John","2":"#123"}' \
  --recipients ./recipients.csv \
  --schedule "25/01/2025 09:00" \
  --delivery-mode regular \
  --delivery-size 10

# Risk mode (no batching — use only for small audiences)
node scripts/create-broadcast.js \
  --name "Urgent Alert" \
  --template-id 42 \
  --test-phone "+14155550123" \
  --recipients ./recipients.csv \
  --schedule "25/01/2025 10:00" \
  --delivery-mode risk
```

**The 3 steps executed internally:**
1. `POST /api:6_ZYypAc/broadcast_test` — sends a real WhatsApp test message to `--test-phone`,
   initialises the `broadcast_schedule` record
2. `POST /api:6_ZYypAc/broadcast_user_recipient_numbers` — uploads the CSV (multipart),
   Xano deduplicates numbers and calculates cost
3. `POST /api:6_ZYypAc/broadcast_schedule` — finalises delivery settings and schedules the job

Returns `{ broadcast_identifier, test, recipients, schedule }` on success.
Each step is shown via stderr progress messages.

**Recipient CSV format:**
```csv
phone_number,body1,body2
14155550101,John,12345
14155550102,Jane,67890
```
Phone numbers must NOT include `+`. Variable columns: `body1`, `body2`, `body3`,
`media`, `button_dynamic_url_value`.

### List AI bots

```bash
node scripts/list-bots.js                    # all bots
node scripts/list-bots.js --default-only     # only the workspace default bot
node scripts/list-bots.js --pretty           # human-readable table to stderr
```

Returns `{ bots: AiBot[], count: n }`.
Bots are sorted: default bot first, then newest first.
Each bot has `id`, `bot_name`, `mission`, `tone`, `delay`, `default`, `notification`,
`human_trigger_keywords`, `handoff_instruction`, `knowledge_base`, `system_prompt`,
`openai_assistant_id`, `files_metadatas`, `file_texts`, `user_id`, `created_at`.

### Get a single AI bot

```bash
node scripts/get-bot.js --id 12
node scripts/get-bot.js --id 12 --pretty
```

Returns the full `bot_config` record for the given ID.
Returns `{ ok: false, error: "Bot with id 12 not found.", status: 400 }` if the ID
does not exist (Xano Precondition fires HTTP 400).

### Create an AI bot

```bash
# Minimal
node scripts/create-bot.js --name "Support Bot"

# Full configuration
node scripts/create-bot.js \
  --name "Support Bot" \
  --mission "Help users resolve support issues quickly and accurately." \
  --knowledge-base "Our return policy is 30 days. Shipping takes 3-5 business days." \
  --system-prompt "You are a friendly support agent. Be concise and helpful." \
  --tone "Friendly" \
  --delay 3 \
  --handoff-instruction "I'll connect you with a human agent now." \
  --trigger-keywords "agent,human,speak to person" \
  --notification \
  --default
```

Returns the created `bot_config` record on success.

> **Plan requirement:** AI Bots require a Pro or Agency plan. On Basic plan, the
> OpenAI Assistant creation will fail — verify with `get-user-plan.js` first.

> **OpenAI dependency:** Creating a bot calls `POST https://api.openai.com/v1/assistants`
> inside Xano. If OpenAI is unavailable or your workspace has no OpenAI key configured,
> the bot will not be saved. The script detects this and returns `{ ok: false, blocked: true }`.

> **No duplicate name check:** Multiple bots with the same `bot_name` are allowed.

> **File-based knowledge base:** Not supported in this script. Upload files manually via
> `POST /api:Sc_sezER/ai_config/files` (10 MB limit, multipart), extract text, then include
> `files_metadatas` and `file_texts` in a direct API call. See `references/bots-reference.md`.

### Create a new Notifyer account

```bash
node scripts/create-account.js \
  --name "Jane Smith" \
  --email jane@company.com \
  --password "Secure@123" \
  --phone 14155550123
```

`--reason` is optional (shown as "(optional)" in the signup UI). Supply it to help the support team understand the use case.

Returns `{ ok: true, data: { authToken, user, apiKey } }` on success.
The `authToken` can be used immediately as `NOTIFYER_API_TOKEN`.

### Login to an existing account

```bash
node scripts/login.js \
  --email jane@company.com \
  --password "Secure@123"
```

Returns `{ ok: true, data: { authToken } }`.

```bash
export NOTIFYER_API_TOKEN="<authToken from above>"
```

### Get the currently authenticated user

```bash
node scripts/get-me.js
```

Returns `{ ok: true, data: { id, name, email, role, phone_number, ... } }`.

## Rules

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
  client-side. This is the same pattern as labels.
- **`whatsapp_template_id` is needed for deletion** — the DELETE endpoint takes Meta's numeric
  `whatsapp_template_id`, not Notifyer's string `template_id`. Use `get-template.js` to look
  it up before deleting.
- **Three distinct auth modes** — Console (`Bearer <jwt>`), Chat (`<jwt>` raw), Developer
  (`<api_key>` raw). The console JWT and the Developer API key are different credentials.
  `get-api-key.js` uses console auth to retrieve the key; the key itself is then used
  by external tools as a raw `Authorization` header.
- **API key requires Pro or Agency plan** — the key can be fetched on any plan, but
  using it for automation (Make, Zapier, n8n, developer API calls) requires Pro or
  Agency. Basic (Bulk Message) plan accounts are blocked. Always verify plan status
  with `get-user-plan.js` before directing a user to set up integrations.
- **Use "Notifyer Systems" module in Make/Zapier/n8n** — the console explicitly warns
  against using the "WhatsAble" module. Direct users to the "Notifyer Systems" module
  specifically when setting up external automations.
- **API key is fixed** — there is no rotate or regenerate endpoint. Treat `api_key`
  as a long-lived secret; store it in env vars, never in source control.
- **`send_template_message_by_api` uses the API key, not the JWT** — when calling
  `POST /api:hFrjh8a1/send_template_message_by_api`, set
  `Authorization: <api_key>` (no Bearer). `phone_number` is passed as **text** here
  (unlike console APIs where it is an integer).
- **`sub_channel: "onboarding_test"`** is a special mode that updates `embedded_users`
  and is only for test sends. Omit `sub_channel` (or pass `""`) for production sends.
- **Label endpoints use chat auth** — `list-labels.js`, `create-label.js`,
  `update-label-keywords.js`, and `delete-label.js` all use
  `Authorization: <token>` (no `Bearer` prefix). The same `NOTIFYER_API_TOKEN`
  from `login.js` works — `notifyer-api.js` handles the format difference via
  `AUTH_MODE_CHAT`.
- **GET labels is role-filtered** — Admin/Super Admin see all labels; Team Members
  see only their assigned labels. Always use an Admin token for label management.
- **Label names must be unique** — `create-label.js` returns
  `{ ok: false, blocked: true }` if a label with the same name already exists.
- **`keywords` is a full replacement** — `update-label-keywords.js --set` replaces
  the entire list. Use `--add` / `--remove` to make incremental changes.
- **No GET-by-ID in the web group** — `update-label-keywords.js` and
  `delete-label.js` both call `GET /web/label_management` to look up the target by
  id before mutating.
- **DELETE returns no body** — Xano returns an empty response for label deletion;
  the script synthesises `{ deleted: true, id, label }` from the pre-flight fetch.
- **Deleting a label does not remove it from members** — after `delete-label.js`,
  update affected team members manually with `update-member.js --labels`.
- **`phone_number` must be a number** — send as integer (e.g. `14155550123`),
  not a string. Xano types this field as `integer`.
- **Password requirements** — minimum 8 characters; must include: uppercase,
  lowercase, number, and special character (e.g. `@!#$%^&*`).
- **Email is lowercased** — the frontend lowercases email before sending.
  Scripts do the same automatically.
- **Login `Origin` header** — the Xano login endpoint reads
  `$http_headers.Origin` and validates Admin/Super Admin users against
  `https://console.notifyer-systems.com`. All login scripts always send this
  header so Admin logins work correctly from scripts.
- **Token storage** — store `authToken` in `NOTIFYER_API_TOKEN`. Never commit
  tokens to source control.
- **Duplicate email** — signup fails with a Xano precondition error if the
  email already exists. The script surfaces this as `{ ok: false, error: "..." }`.
- **Signup side effects** — a single signup call automatically creates the user
  record, an API key record, a subscriber_packages (plan) record, and fires a
  Make webhook. No additional calls are needed.
- **No email invitation flow** — `invite-member.js` creates the account directly.
  Share credentials with the new member out-of-band. There is no "pending invite" state.
- **`update-member.js` fetches current state first** — you only need to supply the fields
  you want to change; unchanged fields are read from the existing member and re-sent.
- **`labels` replaces, not appends** — `update-member.js --labels "Sales"` sets labels
  to exactly `["Sales"]`, removing any previous ones.
- **Super Admin is immutable** — the account owner cannot be created, modified, or deleted
  via any script.
- **Roles for Admin/TM-All auto-clear labels** — `update-member.js` sends `labels: []`
  automatically when the effective role is not `Team Member`.
- **`plan_amount` is in cents** — `latest_plan.plan_amount` is in cents (Stripe convention).
  `get-user-plan.js` adds a `plan_amount_dollars` field for convenience.
- **Subscription is browser-only** — `POST /api:Mk_r6mq0/sessions` creates a Stripe
  checkout session that requires a browser redirect. Agents cannot subscribe on behalf
  of a user — direct them to `https://console.notifyer-systems.com/pricing-plans`.
- **Check plan before messaging** — gate send actions with
  `status ∈ ["active","trialing"]` and `usages < unique_number_limit`.
- **WhatsApp connection is 1:1** — each Notifyer account is connected to exactly
  one WhatsApp Business number. There is no "list phone numbers" endpoint.
  `get-connection-status.js` returns the status of that single number.
- **`isConnected` vs `has_embedded_user`** — `has_embedded_user` means a Meta
  Facebook account has been linked. `isConnected` (`registration.success &&
  subscription.success`) means WhatsApp messaging is actually ready. Always
  check `isConnected` before sending messages.
- **Daily limit on refresh** — `refresh-connection.js` re-triggers Meta
  registration. Meta rate-limits this per day. If you see a daily limit error,
  wait 24 hours.

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
- **AI Bots require Pro or Agency plan** — on Basic plan the workspace has no OpenAI API key
  configured, so `create-bot.js` will always fail (OpenAI returns non-200). Verify with
  `get-user-plan.js` before directing a user to create bots.
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

## API group IDs

Notifyer's backend uses Xano-style API group IDs in the URL path:

| Group | Prefix | Used for |
|-------|--------|----------|
| Auth | `/api:-4GSCDHb` | Signup, login, get-me, api_key, team member CRUD |
| Message Sending | `/api:hFrjh8a1` | Send template messages via Developer API key |
| WhatsApp Connection | `/api:P5grzx1u` | Connection status, Meta re-registration |
| Web/Console | `/api:bVXsw_FD` | Label CRUD (`/web/label_management`), recipients, team |
| Roles | `/api:eWoClqoZ` | Get available label names for member assignment |
| AI Config | `/api:Sc_sezER` | Bots |
| Broadcasts | `/api:6_ZYypAc` | Broadcast test, recipient upload, schedule, list, delete, download |
| Templates | `/api:AFRA_QCy` | Template create, list, delete |
| Media Upload | `/api:ox_LN9zX` | Pre-upload media files for non-text templates |
| Broadcast | `/api:hFrjh8a1` | Send broadcasts |
| Developer/Webhooks | `/api:qh9OQ3OW` | Dev webhooks, incoming/outgoing webhooks |
| Plans | `/api:JZAUyiCs` | Plan listing and selection |

## Scripts

<!-- FILE MAP START -->
| File | Description |
|------|-------------|
| `scripts/lib/notifyer-api.js` | Base HTTP client — loads config, sends requests, handles errors |
| `scripts/lib/args.js` | CLI argument parser (flags, booleans, numbers) |
| `scripts/lib/result.js` | Standard output helpers — `ok()`, `err()`, `printJson()` |
| `scripts/create-account.js` | `POST /api:-4GSCDHb/auth/signup` — create a new Notifyer account |
| `scripts/login.js` | `POST /api:-4GSCDHb/auth/login` — login and get an auth token |
| `scripts/get-me.js` | `GET /api:-4GSCDHb/auth/me` — get the authenticated user's profile |
| `scripts/get-connection-status.js` | `GET /api:P5grzx1u/is_user_embedded` — WhatsApp connection status |
| `scripts/refresh-connection.js` | `POST /api:P5grzx1u/refresher_of_registration_subscription` — force re-sync with Meta |
| `scripts/list-plans.js` | `GET /api:JZAUyiCs/plans?filter=…` — list available subscription plan tiers |
| `scripts/get-user-plan.js` | `GET /api:JZAUyiCs/user_plan` — current subscription and usage |
| `scripts/list-members.js` | `GET /api:-4GSCDHb/auth/get_team_member` — list team members; `--labels` also fetches available label names |
| `scripts/invite-member.js` | `POST /api:-4GSCDHb/auth/create_team_member` — create a team member account |
| `scripts/update-member.js` | `PATCH /api:-4GSCDHb/auth/user` — update role, labels, name, or password |
| `scripts/remove-member.js` | `DELETE /api:-4GSCDHb/auth/delete_team_member/:id` — permanently remove a member |
| `scripts/list-labels.js` | `GET /api:bVXsw_FD/web/label_management` — list workspace labels (role-filtered) |
| `scripts/create-label.js` | `POST /api:bVXsw_FD/web/label_management` — create a new label |
| `scripts/update-label-keywords.js` | `PATCH /api:bVXsw_FD/web/label_management/:id` — update name or keywords (fetch-then-patch) |
| `scripts/delete-label.js` | `DELETE /api:bVXsw_FD/web/label_management/:id` — permanently delete a label |
| `scripts/get-api-key.js` | `GET /api:-4GSCDHb/api_key` — retrieve the Developer API key for Make/Zapier/n8n |
| `scripts/list-templates.js` | `GET /api:AFRA_QCy/templates_web` — list all workspace templates with optional status/category/type filters |
| `scripts/get-template.js` | fetch-then-filter — retrieve a single template by name, template_id, or whatsapp_template_id |
| `scripts/create-template.js` | `POST /api:AFRA_QCy/create` — submit a template for Meta approval (handles media pre-upload internally) |
| `scripts/list-bots.js` | `GET /api:Sc_sezER/ai_config` — list all AI bots in the workspace |
| `scripts/get-bot.js` | `GET /api:Sc_sezER/ai_config/:id` — retrieve a single AI bot by numeric ID |
| `scripts/create-bot.js` | `POST /api:Sc_sezER/ai_config` — create an AI bot (internally creates an OpenAI Assistant) |
| `scripts/list-broadcasts.js` | `GET /api:6_ZYypAc/broadcast?require=…` — list broadcasts by status: upcoming, previous, or ongoing |
| `scripts/get-broadcast.js` | fetch-then-filter — retrieve a single broadcast by id, name, or broadcast_identifier |
| `scripts/create-broadcast.js` | 3-step flow: broadcast_test → upload CSV → broadcast_schedule — create and schedule a broadcast |
<!-- FILE MAP END -->

## References

- `references/account-reference.md` — Full API reference for auth endpoints, field types, error codes, and token usage
- `references/whatsapp-connection-reference.md` — Connection status fields, onboarding checklist, rate limits, and architecture notes
- `references/plans-reference.md` — Plan filters, PricingTier shape, LatestPlan fields, status values, billing model
- `references/team-reference.md` — Role system, team member CRUD endpoints, label assignment rules, common workflows
- `references/labels-reference.md` — Label data model, all CRUD endpoints, keyword auto-assignment behaviour, role-filtering rules
- `references/api-key-reference.md` — Developer API key retrieval, all three auth modes, and `send_template_message_by_api` reference for Make/Zapier/n8n
- `references/templates-reference.md` — Template data model, all endpoints, name rules, categories, media upload, button shapes, status lifecycle, body variables
- `references/bots-reference.md` — AI Bot data model, all CRUD endpoints, OpenAI integration, file upload, set-as-default, plan requirements, bot-assignment in chat
- `references/broadcasts-reference.md` — Full 3-step broadcast workflow, all `/api:6_ZYypAc` endpoints, data model, delivery modes, CSV format, timezone handling, download endpoint

## Assets

- `assets/signup-example.json` — Example signup request payload
- `assets/connection-status-example.json` — Example connection status response
- `assets/user-plan-example.json` — Example response from `get-user-plan.js`

<!-- FILEMAP:BEGIN -->
```text
[setup-notifyer file map]|root: .
|.:{package.json,SKILL.md}
|assets:{connection-status-example.json,signup-example.json,user-plan-example.json}
|references:{account-reference.md,api-key-reference.md,bots-reference.md,broadcasts-reference.md,labels-reference.md,plans-reference.md,team-reference.md,templates-reference.md,whatsapp-connection-reference.md}
|scripts:{create-account.js,create-bot.js,create-broadcast.js,create-label.js,create-template.js,delete-label.js,get-api-key.js,get-bot.js,get-broadcast.js,get-connection-status.js,get-me.js,get-template.js,get-user-plan.js,invite-member.js,list-bots.js,list-broadcasts.js,list-labels.js,list-members.js,list-plans.js,list-templates.js,login.js,refresh-connection.js,remove-member.js,update-label-keywords.js,update-member.js}
|scripts/lib:{args.js,notifyer-api.js,result.js}
```
<!-- FILEMAP:END -->

