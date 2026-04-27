---
name: setup-notifyer
description: >
  Create and manage a Notifyer by WhatsAble account — signup, login, retrieve the
  authenticated user, check WhatsApp connection status, manage subscription plans,
  manage team members, assign roles, configure workspace labels, and retrieve the
  Developer API key. Use this skill any time you need to authenticate against the
  Notifyer Console API, set up a new workspace, or prepare the identity and
  infrastructure before running automate-notifyer or chat-notifyer.
license: Proprietary — © WhatsAble. All rights reserved.
compatibility: Requires Node.js >= 18. Set NOTIFYER_API_BASE_URL and NOTIFYER_API_TOKEN environment variables before running any script.
metadata:
  author: whatsable
  version: "1.0.0"
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

### Run a pre-flight health check (start here when debugging)

```bash
node scripts/doctor.js
node scripts/doctor.js --pretty   # human-readable pass/fail report to stderr
```

Validates all four prerequisites in one command:
1. `NOTIFYER_API_BASE_URL` — set and starts with `https://`
2. Token (`NOTIFYER_API_TOKEN`) — valid and accepted by `/auth/me`
3. WhatsApp connection — `isConnected: true` (and detects degraded Meta states)
4. Plan status — subscription is `active`, `trialing`, or `new_user`

Returns `{ ok: true, data: { all_healthy: true, checks: { base_url, token, connection, plan } } }`.
Returns `{ ok: false, ... }` (exit 1) if any check fails, with a `fix` hint for each failure.

**Run `doctor.js` before any other script when troubleshooting unexpected failures.**

### Check WhatsApp connection status

```bash
node scripts/get-connection-status.js
node scripts/get-connection-status.js --pretty   # human-readable summary to stderr
```

Returns `{ ok: true, data: { isConnected, degraded, meta_errors, has_embedded_user,
registration, subscription, payment_method_added, is_template_has, is_message_tested,
is_profile_picture_added, onboarding_steps_completed } }`.

`isConnected = true` means the phone number has both successful Meta registration and
subscription — it is ready to send messages.

`degraded = true` means `isConnected` is true but Meta returned hidden errors inside
the `whatsapp_response` payload (e.g. two-step PIN mismatch, account restricted). Always
check `degraded` alongside `isConnected` — a degraded connection may fail silently.
`meta_errors` contains the extracted error details as a string array.

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

### Get the Developer API key

```bash
node scripts/get-api-key.js
node scripts/get-api-key.js --pretty   # prints key to stderr for easy copying
```

Returns `{ id, api_key, user_id, created_at }`.

The `api_key` value is the credential used by **Make, Zapier, n8n, and custom scripts**
to send messages via the developer API. It authenticates as a **raw `Authorization`**
header (no `Bearer` prefix) — different from `NOTIFYER_API_TOKEN`.

### Send feedback to the Notifyer team

Use this whenever you encounter an error, find something unclear, want to request
a feature, or spot a potential security issue.

```bash
# Report an error you hit
node scripts/send-feedback.js \
  --feedback "send-text.js returned 200 but message was not delivered — no error in output" \
  --type error --skill chat-notifyer --script send-text.js

# Request a missing feature
node scripts/send-feedback.js \
  --feedback "Need a script to list all open conversations sorted by last message time" \
  --type request --skill chat-notifyer

# Flag unclear documentation
node scripts/send-feedback.js \
  --feedback "SKILL.md does not explain what happens when recipient_id is missing from send-template" \
  --type unclear --skill chat-notifyer --script send-template.js

# Report a security concern
node scripts/send-feedback.js \
  --feedback "delete-webhook.js endpoint has no server-side auth check in Xano" \
  --type security --skill automate-notifyer --script delete-webhook.js

# General improvement suggestion
node scripts/send-feedback.js \
  --feedback "Pretty output for get-conversation.js would be easier to read with timestamps on each line" \
  --type improvement --skill chat-notifyer --script get-conversation.js
```

**`--type` values:** `error` | `request` | `unclear` | `security` | `improvement` | `general`  
**`--skill`** and **`--script`** are optional but help the team triage the record.

Returns `{ ok: true, data: { id, created_at, user_id, feedback } }` on success.

**When to send feedback — guidance for agents:**
- A script returns an unexpected error or undocumented response shape
- An endpoint behaves differently from what `SKILL.md` or the reference docs describe
- A workflow step is unclear or the documentation is missing information
- You encounter a potential security issue (wrong auth mode, data exposure, etc.)
- A feature or endpoint is missing that would improve your ability to complete the task

## Rules

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
- **`Origin` header is injected automatically.** `notifyer-api.js` adds
  `Origin: https://console.notifyer-systems.com` for console-mode requests and
  `Origin: https://chat.notifyer-systems.com` for chat-mode requests. You never need
  to pass it manually. If a script sets `Origin` via `extraHeaders`, that value
  takes precedence. This fixes a class of silent 401s that occurred when the header
  was missing on Xano endpoints that validate it.
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

## API group IDs

Notifyer's backend uses Xano-style API group IDs in the URL path:

| Group | Prefix | Used for |
|-------|--------|----------|
| Auth | `/api:-4GSCDHb` | Signup, login, get-me, api_key, team member CRUD |
| Message Sending | `/api:hFrjh8a1` | Send template messages via Developer API key |
| WhatsApp Connection | `/api:P5grzx1u` | Connection status, Meta re-registration |
| Web/Console | `/api:bVXsw_FD` | Label CRUD (`/web/label_management`), recipients, team |
| Roles | `/api:eWoClqoZ` | Get available label names for member assignment |
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
| `scripts/doctor.js` | Pre-flight health check — validates base URL, token, WhatsApp connection, and plan status in one command |
| `scripts/send-feedback.js` | `POST /api:ox_LN9zX/agent_feedback` — send feedback, error reports, or feature requests to the Notifyer team |
<!-- FILE MAP END -->

## References

- `../../AUTHENTICATION.md` — **Start here.** All three auth surfaces (Console/Chat/Developer) with curl examples, decision guide, environment variables, and error diagnostics
- `references/account-reference.md` — Full API reference for auth endpoints, field types, error codes, and token usage
- `references/whatsapp-connection-reference.md` — Connection status fields, onboarding checklist, rate limits, and architecture notes
- `references/plans-reference.md` — Plan filters, PricingTier shape, LatestPlan fields, status values, billing model
- `references/team-reference.md` — Role system, team member CRUD endpoints, label assignment rules, common workflows
- `references/labels-reference.md` — Label data model, all CRUD endpoints, keyword auto-assignment behaviour, role-filtering rules
- `references/api-key-reference.md` — Developer API key retrieval, all three auth modes, and `send_template_message_by_api` reference for Make/Zapier/n8n

## Assets

- `assets/signup-example.json` — Example signup request payload
- `assets/connection-status-example.json` — Example connection status response
- `assets/user-plan-example.json` — Example response from `get-user-plan.js`

## Security Notes

- **`NOTIFYER_API_BASE_URL` must be `https://`.**  All three skills enforce this at startup — any `http://` or non-HTTPS URL is rejected immediately to prevent tokens being sent unencrypted or to a rogue host.
- **`--password` is visible in the OS process list.** CLI flags are readable via `ps aux` or `/proc/<pid>/cmdline` for the lifetime of the process. On shared or monitored machines, prefer injecting credentials via environment variables or a secrets manager rather than bare CLI flags.
- **The JWT token from `login.js` is printed to stdout.** This is by design — the agent must capture it to export `NOTIFYER_API_TOKEN`. In orchestrated environments, ensure stdout is not persisted to unprotected logs. Treat the token like a session cookie.
- **The Developer API key from `get-api-key.js` is printed to both stdout and stderr.** Store it immediately in a secrets manager. It provides direct WhatsApp send access without a session login.
- **Zero npm dependencies.** All three skills use only Node.js built-ins — there is no supply chain risk from third-party packages.

## Limitations

- **WhatsApp initial connection requires a browser.** The QR scan / embedded signup flow (WABA onboarding) cannot be scripted. An admin must complete it once via the Notifyer console UI (console.notifyer-systems.com). After that, `get-connection-status.js` and `refresh-connection.js` can manage the connection programmatically.
- **WhatsApp OTP verification is browser-only.** The `PATCH /api:0hqyGRIz/whatsapp_verification/{userId}` endpoint (OTP submission during phone re-authentication) is triggered by the console UI. There is no script for this flow.
- **WhatsApp Business Account (WABA) and Meta Business Suite setup must be done manually.** Phone number registration, business verification, and WABA approval are Meta-side processes outside the Notifyer API.
- **Account creation is irreversible via script.** `create-account.js` creates a full Notifyer workspace. There is no delete-account endpoint.
- **Password recovery must be done via the Notifyer web UI.** The reset flow (`GET /reset_password?email=` to trigger email + `PATCH /reset_password` to set the new password) requires the user to click a link in the email. There is no agent-accessible reset path that bypasses the email step.
- **`refresh-connection.js` re-syncs an existing connection.** It cannot re-initiate a fully disconnected or revoked WABA — that requires going through the browser-based embedded signup again.
- **Plan upgrades, downgrades, and credit purchases are browser-only (Stripe).** `list-plans.js` and `get-user-plan.js` are read-only. Changing plans (`POST /api:Mk_r6mq0/sessions`), accessing the billing portal (`POST /api:Mk_r6mq0/portal`), and buying credits (`POST /api:Mk_r6mq0/add_credits`) are Stripe redirect flows — not scriptable.
- **Profile picture uploads and onboarding step markers are UI-only.** `PATCH /profile_picture_update`, `PATCH /payment_method_update`, and `PATCH /test_message_update` are completion flags set by the console onboarding UI. There are no scripts for these — they do not affect core messaging functionality once the account is set up.
- **Super Admin role cannot be assigned via script.** Only Admin and Team Member roles are assignable through `update-member.js`. Super Admin is set by Notifyer at workspace creation.

<!-- FILEMAP:BEGIN -->
```text
[setup-notifyer file map]|root: .
|.:{package.json,SKILL.md}
|assets:{connection-status-example.json,signup-example.json,user-plan-example.json}
|references:{account-reference.md,api-key-reference.md,labels-reference.md,plans-reference.md,team-reference.md,whatsapp-connection-reference.md}
|scripts:{create-account.js,create-label.js,delete-label.js,doctor.js,get-api-key.js,get-connection-status.js,get-me.js,get-user-plan.js,invite-member.js,list-labels.js,list-members.js,list-plans.js,login.js,refresh-connection.js,remove-member.js,send-feedback.js,update-label-keywords.js,update-member.js}
|scripts/lib:{args.js,notifyer-api.js,result.js}
```
<!-- FILEMAP:END -->
