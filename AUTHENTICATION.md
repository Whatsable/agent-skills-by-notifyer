# Notifyer Authentication Guide

This guide covers every authentication pattern used across the three
`agent-skills-by-notifyer` skills. Read it once to understand which credential
to use, how to format the header, and how to diagnose failures.

---

## Overview — Three auth surfaces

Notifyer's backend has three completely separate API surfaces. Each validates
a different credential. Scripts select the correct mode automatically — you
only ever need to set `NOTIFYER_API_TOKEN` once.

| Surface | Header format | Used by | Skills |
|---------|--------------|---------|--------|
| **Console** | `Authorization: Bearer <jwt>` | Account, plans, team, templates, bots, broadcasts, webhooks, analytics | `setup-notifyer`, `automate-notifyer` |
| **Chat** | `Authorization: <jwt>` *(raw — no `Bearer` prefix)* | Recipients, messaging, labels, handoff, scheduling, notes | `chat-notifyer` |
| **Developer** | `Authorization: <api_key>` *(raw — no `Bearer` prefix)* | External tools only: Make, Zapier, n8n — only `send_template_message_by_api` | none (curl / external) |

> **Same JWT, two formats.** `NOTIFYER_API_TOKEN` is a single JWT from `login.js`.
> The Console surface expects it as `Bearer <jwt>`; the Chat surface expects it raw
> with no prefix. The `notifyer-api.js` library handles this automatically.
> You never set it twice.

---

## Step 0 — Environment bootstrap

Before running any script, set these two variables:

```bash
export NOTIFYER_API_BASE_URL="https://api.insightssystem.com"
export NOTIFYER_API_TOKEN=""          # fill in after login below
```

`NOTIFYER_API_BASE_URL` **must start with `https://`**. All three skills reject
`http://` URLs at startup to prevent tokens being transmitted unencrypted.

---

## Step 1 — Get a JWT (login)

### Using the script (recommended)

```bash
node skills/setup-notifyer/scripts/login.js \
  --email you@company.com \
  --password "YourPassword@1"
```

Output:

```json
{ "ok": true, "data": { "authToken": "eyJhbGciOi..." } }
```

Export immediately:

```bash
export NOTIFYER_API_TOKEN="eyJhbGciOi..."
```

### Using curl directly

```bash
curl -s -X POST https://api.insightssystem.com/api:-4GSCDHb/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://console.notifyer-systems.com" \
  -d '{
    "email": "you@company.com",
    "password": "YourPassword@1"
  }'
```

> **`Origin` header is required for login.**  
> The Xano backend reads `$http_headers.Origin` and validates it against
> `https://console.notifyer-systems.com` for Admin and Super Admin accounts.
> Omitting it causes a `Precondition failed` error even with correct credentials.
> The `login.js` script sends this header automatically.

Response:

```json
{ "authToken": "eyJhbGciOiJBMjU2S1ciLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIn0..." }
```

### Alternative — create a new account (also returns a JWT)

```bash
curl -s -X POST https://api.insightssystem.com/api:-4GSCDHb/auth/signup \
  -H "Content-Type: application/json" \
  -H "Origin: https://console.notifyer-systems.com" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@company.com",
    "password": "Secure@123",
    "phone_number": 14155550123,
    "reason_of_automate": "Automate customer support"
  }'
```

> `phone_number` must be an **integer** (not a string) — Xano types this field as `integer`.

Response contains `authToken` and `user` — export the token as above.

---

## Surface 1 — Console API

**Header:** `Authorization: Bearer <jwt>`  
**Origin:** `https://console.notifyer-systems.com` *(auto-injected by scripts)*  
**Skills:** `setup-notifyer`, `automate-notifyer`

### Verify the token is valid

```bash
curl -s https://api.insightssystem.com/api:-4GSCDHb/auth/me \
  -H "Authorization: Bearer $NOTIFYER_API_TOKEN" \
  -H "Origin: https://console.notifyer-systems.com"
```

Response:

```json
{
  "id": 42,
  "name": "Jane Smith",
  "email": "jane@company.com",
  "role": "Admin",
  "phone_number": 14155550123,
  "created_at": 1712000000000
}
```

### Check WhatsApp connection status

```bash
curl -s https://api.insightssystem.com/api:P5grzx1u/is_user_embedded \
  -H "Authorization: Bearer $NOTIFYER_API_TOKEN" \
  -H "Origin: https://console.notifyer-systems.com"
```

### List templates

```bash
curl -s https://api.insightssystem.com/api:AFRA_QCy/templates_broadcast_web \
  -H "Authorization: Bearer $NOTIFYER_API_TOKEN" \
  -H "Origin: https://console.notifyer-systems.com"
```

### When to use

Use Console auth for **everything in `setup-notifyer` and `automate-notifyer`**:
account management, team, plans, templates, bots, broadcasts, analytics, and webhooks.

---

## Surface 2 — Chat API

**Header:** `Authorization: <jwt>` *(raw — no `Bearer` prefix)*  
**Origin:** `https://chat.notifyer-systems.com` *(auto-injected by scripts)*  
**Skills:** `chat-notifyer`

The JWT is the **same token** as the Console surface — only the header format differs.
The Xano middleware on chat routes strips the `Bearer` prefix expectation.

### List recipients (conversations)

```bash
curl -s "https://api.insightssystem.com/api:bVXsw_FD/web/recipient?page=1&per_page=20" \
  -H "Authorization: $NOTIFYER_API_TOKEN" \
  -H "Origin: https://chat.notifyer-systems.com"
```

### Send a text message (within 24-hour window)

```bash
curl -s -X POST https://api.insightssystem.com/api:5l-RgW1B/message/send_message \
  -H "Content-Type: application/json" \
  -H "Authorization: $NOTIFYER_API_TOKEN" \
  -H "Origin: https://chat.notifyer-systems.com" \
  -d '{
    "message": "Hello! How can I help you today?",
    "recipient_id": 123
  }'
```

> **24-hour window:** Free-text and media messages can only be sent within 24 hours
> of the last inbound message from the recipient. Outside this window, use
> `send-template.js` (template messages are not window-restricted).

### Assign a label

```bash
curl -s -X PATCH "https://api.insightssystem.com/api:bVXsw_FD/web/recipient/123" \
  -H "Content-Type: application/json" \
  -H "Authorization: $NOTIFYER_API_TOKEN" \
  -H "Origin: https://chat.notifyer-systems.com" \
  -d '{ "labels": ["Support", "VIP"] }'
```

### When to use

Use Chat auth for **everything in `chat-notifyer`**: listing recipients,
sending messages, managing labels, handoff, scheduling, and notes.

**One exception:** `list-bots.js` uses **Console auth** (`Bearer` prefix)
because the bot configuration endpoint lives in the Console API group.

---

## Surface 3 — Developer API

**Header:** `Authorization: <api_key>` *(raw — no `Bearer` prefix)*  
**No Origin header required**  
**Skills:** none — used by external tools (Make, Zapier, n8n) or direct curl

The Developer API key is a **separate, static credential** — not the JWT.
Retrieve it once:

```bash
node skills/setup-notifyer/scripts/get-api-key.js --pretty
```

Or via curl (requires Console JWT first):

```bash
curl -s https://api.insightssystem.com/api:-4GSCDHb/api_key \
  -H "Authorization: Bearer $NOTIFYER_API_TOKEN" \
  -H "Origin: https://console.notifyer-systems.com"
```

Response: `{ "id": 1, "api_key": "eyJ...", "user_id": "uuid", "created_at": 0 }`

Store it:

```bash
export NOTIFYER_DEV_API_KEY="eyJ..."
```

### Send a template message via Developer API

This is the **only endpoint** on the Developer API surface:

```bash
curl -s -X POST https://api.insightssystem.com/api:hFrjh8a1/send_template_message_by_api \
  -H "Content-Type: application/json" \
  -H "Authorization: $NOTIFYER_DEV_API_KEY" \
  -d '{
    "phone_number": "14155550123",
    "template": "my_template_name",
    "__self": { "1": "Hello", "2": "World" },
    "sub_channel": ""
  }'
```

> - `phone_number` is a **string** here (unlike Console endpoints where it is an integer).
> - `__self` contains template variable values keyed by position index.
> - `sub_channel: "onboarding_test"` is a test-only mode — omit or pass `""` for production.
> - This endpoint does **not** require an `Origin` header.

### When to use

Use the Developer API key **only** for `POST /api:hFrjh8a1/send_template_message_by_api`
when integrating with Make, Zapier, n8n, or writing a custom webhook handler.
For all other operations, use the Console or Chat JWT.

> **Plan requirement:** The Developer API key can be fetched on any plan, but
> **using** it for automation requires a **Pro or Agency plan**. Basic (Bulk Message)
> plan accounts are blocked. Verify with `get-user-plan.js` before directing a user
> to set up external integrations.

---

## Decision guide — which auth to use?

```
What are you doing?
│
├─ Authenticating / account setup / team / plans / WhatsApp connection?
│   → Console auth: Authorization: Bearer <jwt>
│   → Skill: setup-notifyer
│
├─ Templates / bots / broadcasts / analytics / webhooks?
│   → Console auth: Authorization: Bearer <jwt>
│   → Skill: automate-notifyer
│
├─ Recipients / conversations / messaging / labels / handoff / notes?
│   → Chat auth: Authorization: <jwt>   (no Bearer)
│   → Skill: chat-notifyer
│
├─ Sending a template from Make / Zapier / n8n / external webhook?
│   → Developer auth: Authorization: <api_key>   (no Bearer)
│   → Endpoint: POST /api:hFrjh8a1/send_template_message_by_api
│
└─ Listing bots (inside chat-notifyer)?
    → Console auth: Authorization: Bearer <jwt>   (intentional exception)
    → list-bots.js handles this automatically
```

---

## Diagnosing auth failures

| HTTP status | Likely cause | Fix |
|-------------|-------------|-----|
| `401 Unauthorized` on login | Missing `Origin` header | Add `-H "Origin: https://console.notifyer-systems.com"` |
| `401 Unauthorized` on Console endpoint | Token expired or wrong format | Re-run `login.js`; check you're using `Bearer <jwt>`, not raw |
| `401 Unauthorized` on Chat endpoint | Using `Bearer` prefix when raw expected | Remove `Bearer ` — send raw token: `Authorization: <jwt>` |
| `401 Unauthorized` on Developer endpoint | Using JWT instead of API key, or `Bearer` prefix | Use `NOTIFYER_DEV_API_KEY` without `Bearer` prefix |
| `403 Forbidden` | Account role insufficient | Use an Admin token; Team Member tokens are restricted |
| `Precondition failed` | Wrong email/password, or Admin login without Origin | Verify credentials; add Origin header |

### Run the doctor script first

When something breaks, always start here:

```bash
node skills/setup-notifyer/scripts/doctor.js --pretty
```

This validates all four prerequisites in one call:
1. `NOTIFYER_API_BASE_URL` — set and starts with `https://`
2. Token — valid and accepted by `/auth/me`
3. WhatsApp connection — `isConnected: true`, not `degraded`
4. Plan status — `active`, `trialing`, or `new_user`

Each failing check includes a `fix` hint with the exact corrective action.

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTIFYER_API_BASE_URL` | **yes** | Backend base URL. Must start with `https://`. Default: `https://api.insightssystem.com` |
| `NOTIFYER_API_TOKEN` | yes (all authenticated calls) | JWT from `login.js`. Used for both Console (`Bearer <jwt>`) and Chat (raw `<jwt>`) surfaces. |
| `NOTIFYER_DEV_API_KEY` | only for Developer API | Static workspace API key from `get-api-key.js`. Used only for `send_template_message_by_api`. |
| `NOTIFYER_CHAT_ORIGIN` | no | Override for the chat CORS Origin header. Defaults to `https://chat.notifyer-systems.com`. |

---

## Token lifecycle

- **JWT expiry:** Notifyer JWTs are session tokens. If a script returns `401` on a
  previously working token, re-run `login.js` and export the new value.
- **Developer API key:** Static — it does not expire and cannot be rotated via the API.
  Treat it as a long-lived secret. If it is compromised, contact Notifyer support.
- **Never commit either credential to source control.** Use environment variables,
  `.env` files excluded by `.gitignore`, or a secrets manager.

---

## API group reference

Scripts use opaque Xano-style API group IDs in the URL path:

| Group | Path prefix | Auth surface | Used for |
|-------|-------------|-------------|---------|
| Auth | `/api:-4GSCDHb` | Console | Signup, login, get-me, api_key, team member CRUD |
| Message Sending | `/api:hFrjh8a1` | Developer | `send_template_message_by_api` |
| WhatsApp Connection | `/api:P5grzx1u` | Console | Connection status, Meta re-registration |
| Web/Console | `/api:bVXsw_FD` | Console or Chat | Labels, recipients, team (dual-mode — check individual endpoint) |
| Plans | `/api:JZAUyiCs` | Console | Plan listing, user plan |
| Templates | `/api:AFRA_QCy` | Console | Template CRUD |
| Bots | `/api:ox_LN9zX` | Console | AI bot CRUD |
| Broadcasts | `/api:6_ZYypAc` | Console | Broadcast CRUD and scheduling |
| Analytics | `/api:Sc_sezER` | Console | Delivery logs, usage analytics |
| Webhooks (Dev/IO) | `/api:qh9OQ3OW` | Console | Developer webhooks, IO webhooks |
| Messaging (Chat) | `/api:5l-RgW1B` | Chat | Send text, template, attachment |
| Scheduling | `/api:ereqLKj6` | Chat | Schedule and cancel messages |
| Notes | `/api:MLBAaPmt` | Chat | Add and retrieve recipient notes |

---

## See also

- `skills/setup-notifyer/references/account-reference.md` — Full login/signup Xano function stack, field types, error codes
- `skills/setup-notifyer/references/api-key-reference.md` — Developer API key details, `send_template_message_by_api` Xano function stack
- `skills/setup-notifyer/scripts/doctor.js` — Automated pre-flight health check
- `skills/setup-notifyer/scripts/login.js` — Get a JWT
- `skills/setup-notifyer/scripts/get-api-key.js` — Get the Developer API key
