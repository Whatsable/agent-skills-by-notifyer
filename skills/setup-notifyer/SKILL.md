---
name: setup-notifyer
description: >
  Create and manage a Notifyer by WhatsAble account — signup, login, retrieve the
  authenticated user, check WhatsApp connection status, manage subscription plans,
  manage team members, assign roles, and configure workspace labels. Use this skill
  any time you need to authenticate against the Notifyer Console API or set up a
  new workspace.
license: Proprietary — © WhatsAble. All rights reserved.
compatibility: Requires Node.js >= 18. Set NOTIFYER_API_BASE_URL and NOTIFYER_API_TOKEN environment variables before running any script.
metadata:
  author: whatsable
  version: "0.1.0"
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
| Templates | `/api:AFRA_QCy` | Templates for broadcast |
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
<!-- FILE MAP END -->

## References

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

<!-- FILEMAP:BEGIN -->
```text
[setup-notifyer file map]|root: .
|.:{package.json,SKILL.md}
|assets:{connection-status-example.json,signup-example.json,user-plan-example.json}
|references:{account-reference.md,api-key-reference.md,labels-reference.md,plans-reference.md,team-reference.md,whatsapp-connection-reference.md}
|scripts:{create-account.js,create-label.js,delete-label.js,get-api-key.js,get-connection-status.js,get-me.js,get-user-plan.js,invite-member.js,list-labels.js,list-members.js,list-plans.js,login.js,refresh-connection.js,remove-member.js,update-label-keywords.js,update-member.js}
|scripts/lib:{args.js,notifyer-api.js,result.js}
```
<!-- FILEMAP:END -->

