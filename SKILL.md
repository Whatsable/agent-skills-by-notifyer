---
name: whatsapp-business-agent-skills
description: >
  Full three-phase agent skills suite for Notifyer by WhatsAble. Phase 1 (setup-notifyer):
  account signup, login, WhatsApp connection status, subscription plans, team members,
  workspace labels, and Developer API key. Phase 2 (automate-notifyer): WhatsApp message
  templates, AI bots, bulk broadcast campaigns, messaging analytics, delivery logs, and
  developer/IO webhooks. Phase 3 (chat-notifyer): live WhatsApp chat operations including
  listing and searching conversations, sending text/template/attachment messages, managing
  labels, controlling AI bot vs human handoff, scheduling messages, and managing recipient
  notes. All three phases are bundled together; each phase depends on the previous one.
license: Proprietary — © WhatsAble. All rights reserved.
compatibility: Requires Node.js >= 18. Set NOTIFYER_API_BASE_URL and NOTIFYER_API_TOKEN before running any script. No npm dependencies — uses Node.js built-ins only.
metadata: {"author":"whatsable","version":"0.4.0","product":"Notifyer by WhatsAble","api-base":"https://api.insightssystem.com","homepage":"https://github.com/Whatsable/whatsapp-business-agent-skills","env":"NOTIFYER_API_BASE_URL, NOTIFYER_API_TOKEN"}
---

# Notifyer Agent Skills

Agent skills for [Notifyer by WhatsAble](https://notifyer-systems.com) — three phases that
together cover the full platform: account setup, automation infrastructure, and live chat
operations. Scripts are self-contained Node.js 18+ files with no external npm dependencies.

Source repository: <https://github.com/Whatsable/whatsapp-business-agent-skills>

---

## Phase overview

| Phase | Skill folder | Coverage |
|-------|-------------|----------|
| 1 | `skills/setup-notifyer` | Account, login, WhatsApp connection, plans, team, labels, API key |
| 2 | `skills/automate-notifyer` | Templates, AI bots, broadcasts, analytics, webhooks |
| 3 | `skills/chat-notifyer` | Recipients, messaging, labels, handoff, scheduling, notes |

Each phase depends on the one before it. Obtain `NOTIFYER_API_TOKEN` from Phase 1
(`skills/setup-notifyer/scripts/login.js`) before using Phase 2 or Phase 3.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTIFYER_API_BASE_URL` | **yes** | API base URL — use `https://api.insightssystem.com` |
| `NOTIFYER_API_TOKEN` | **yes** | JWT token from `setup-notifyer/scripts/login.js` |
| `NOTIFYER_CHAT_ORIGIN` | no | CORS Origin override for Phase 3 chat endpoints (default: `https://chat.notifyer-systems.com`) |

```bash
export NOTIFYER_API_BASE_URL="https://api.insightssystem.com"
export NOTIFYER_API_TOKEN="<jwt-from-login.js>"
```

`NOTIFYER_API_BASE_URL` must start with `https://` — all three skill sets enforce this
at startup and exit immediately on a non-HTTPS value to prevent token exposure.

---

## Authentication modes

| Mode | Header format | Used by |
|------|--------------|---------|
| Console | `Authorization: Bearer <token>` | Phase 1, Phase 2, and most Phase 3 scripts |
| Chat | `Authorization: <token>` (no Bearer prefix) | Phase 3 chat endpoints, Phase 1 label endpoints |
| Developer | `Authorization: <api_key>` (no Bearer prefix) | External tools (Make / Zapier / n8n) via `get-api-key.js` |

The same JWT token (`NOTIFYER_API_TOKEN`) works for both Console and Chat modes.
`notifyer-api.js` selects the correct header format automatically per endpoint.

---

## Phase 1 — setup-notifyer

Scripts live in `skills/setup-notifyer/scripts/`.

**Start here.** Login to get `NOTIFYER_API_TOKEN`, then verify the workspace is ready
with `doctor.js` before running Phase 2 or Phase 3 scripts.

### Key commands

```bash
# Create a new account
node skills/setup-notifyer/scripts/create-account.js \
  --name "Jane Smith" --email jane@company.com \
  --password "Secure@123" --phone 14155550123

# Login and export the token
node skills/setup-notifyer/scripts/login.js \
  --email jane@company.com --password "Secure@123"
export NOTIFYER_API_TOKEN="<authToken from above>"

# Pre-flight health check (validates URL, token, WhatsApp connection, plan)
node skills/setup-notifyer/scripts/doctor.js --pretty

# Check WhatsApp connection status
node skills/setup-notifyer/scripts/get-connection-status.js --pretty

# List team members
node skills/setup-notifyer/scripts/list-members.js --pretty

# List workspace labels
node skills/setup-notifyer/scripts/list-labels.js --pretty

# Retrieve Developer API key (for Make / Zapier / n8n)
node skills/setup-notifyer/scripts/get-api-key.js --pretty
```

For the full Phase 1 script reference see `skills/setup-notifyer/SKILL.md`.

---

## Phase 2 — automate-notifyer

Scripts live in `skills/automate-notifyer/scripts/`.

Requires: completed Phase 1 with `NOTIFYER_API_TOKEN` set, WhatsApp number connected,
and (for bots and broadcasts) a Pro or Agency subscription.

### Key commands

```bash
# Templates
node skills/automate-notifyer/scripts/list-templates.js --status approved --pretty
node skills/automate-notifyer/scripts/create-template.js \
  --name order_confirmation --category MARKETING \
  --body "Hello {{1}}, your order #{{2}} is confirmed." \
  --variables '{"1":"John","2":"12345"}'

# AI bots
node skills/automate-notifyer/scripts/list-bots.js --pretty
node skills/automate-notifyer/scripts/create-bot.js \
  --name "Support Bot" --mission "Help resolve support issues." \
  --tone "Friendly" --delay 3 --default

# Broadcasts
node skills/automate-notifyer/scripts/list-broadcasts.js --status upcoming --pretty
node skills/automate-notifyer/scripts/create-broadcast.js \
  --name "January Sale" --template-id 42 \
  --test-phone "+14155550123" \
  --recipients ./recipients.csv \
  --schedule "25/01/2025 14:00" \
  --delivery-mode smart

# Analytics
node skills/automate-notifyer/scripts/get-message-analytics.js --days 30 --pretty

# Webhooks
node skills/automate-notifyer/scripts/list-webhooks.js --type dev --pretty
node skills/automate-notifyer/scripts/create-webhook.js \
  --url "https://hook.eu2.make.com/abc" --incoming --outgoing --signature
```

For the full Phase 2 script reference see `skills/automate-notifyer/SKILL.md`.

---

## Phase 3 — chat-notifyer

Scripts live in `skills/chat-notifyer/scripts/`.

Requires: completed Phase 1 with `NOTIFYER_API_TOKEN` set and WhatsApp number connected.

Phase 3 endpoints use **Chat auth mode**: `Authorization: <token>` (no Bearer prefix).
The same JWT from `login.js` works — `notifyer-api.js` switches the header format automatically.

### WhatsApp 24-hour messaging window

Free-text messages and attachments can only be sent within 24 hours of the recipient's
last inbound message. Check `recipient.expiration_timestamp` to determine window state:

- Window open (`expiration_timestamp > Date.now()`): text, template, and attachment sends are allowed
- Window closed (`null` or past): template-only sends are allowed

### Key commands

```bash
# List all active conversations
node skills/chat-notifyer/scripts/list-recipients.js --pretty

# Search for a contact
node skills/chat-notifyer/scripts/list-recipients.js --search "John" --pretty

# Get full recipient details (includes 24h window state)
node skills/chat-notifyer/scripts/get-recipient.js --phone 14155550123 --pretty

# Send a text message
node skills/chat-notifyer/scripts/send-text.js \
  --phone 14155550123 --text "Hello! How can I help?"

# Send a template message
node skills/chat-notifyer/scripts/send-template.js \
  --phone 14155550123 --template order_confirmation \
  --variables '{"1":"John","2":"12345"}'

# Send an attachment
node skills/chat-notifyer/scripts/send-attachment.js \
  --phone 14155550123 --file ./invoice.pdf --caption "Your invoice"

# Assign a label
node skills/chat-notifyer/scripts/assign-label.js \
  --phone 14155550123 --labels "Support,VIP"

# Control AI bot vs human handoff
node skills/chat-notifyer/scripts/set-handoff.js \
  --phone 14155550123 --handoff true   # true = human handles; false = bot handles

# Schedule a message
node skills/chat-notifyer/scripts/send-template.js \
  --phone 14155550123 --template order_confirmation \
  --variables '{"1":"John","2":"12345"}' \
  --schedule "2025-06-01T09:00:00"

# Add a note to a conversation
node skills/chat-notifyer/scripts/add-note.js \
  --phone 14155550123 --note "VIP customer — apply 15% discount"

# Get conversation history
node skills/chat-notifyer/scripts/get-conversation.js \
  --phone 14155550123 --pretty
```

For the full Phase 3 script reference see `skills/chat-notifyer/SKILL.md`.

---

## Cross-phase usage notes

- Run `skills/setup-notifyer/scripts/doctor.js --pretty` as a first step when
  troubleshooting any script failure. It validates base URL, token, WhatsApp
  connection, and plan status in one pass.
- Phone numbers are always integers without the `+` prefix (e.g. `14155550123`).
  Scripts strip the `+` automatically when it is supplied.
- `NOTIFYER_API_BASE_URL` is validated at startup in every script. An `http://`
  value is rejected immediately — HTTPS is required to prevent token exposure.
- AI Bots and Broadcasts (Phase 2) require a Pro or Agency subscription. Verify
  plan status with `get-user-plan.js` before directing users to those features.
- The WhatsApp initial connection (WABA embedded signup) cannot be scripted. A
  workspace admin must complete it once via the Notifyer console browser UI at
  `console.notifyer-systems.com`. After that, all connection management is scriptable.
- Subscription and billing changes are browser-only Stripe flows. Direct users to
  `https://console.notifyer-systems.com/pricing-plans` for plan changes.

---

## Security

- **Zero npm dependencies.** All scripts use only Node.js built-in modules —
  no third-party packages, no supply chain risk.
- **Token handling.** `login.js` prints the JWT to stdout by design so the agent
  can capture and export it. Treat it like a session cookie and avoid persisting
  it in unprotected logs.
- **Developer API key.** `get-api-key.js` outputs the key to stdout and stderr.
  Store it in a secrets manager immediately. It is a long-lived credential that
  grants direct WhatsApp send access.
- **HTTPS enforcement.** All scripts call `loadConfig()` which exits with an error
  if `NOTIFYER_API_BASE_URL` does not start with `https://`.

---

## Repository structure

```
skills/
  setup-notifyer/          Phase 1 — account, auth, connection, team, labels
    SKILL.md
    scripts/
    references/
    assets/
  automate-notifyer/       Phase 2 — templates, bots, broadcasts, analytics, webhooks
    SKILL.md
    scripts/
    references/
    assets/
  chat-notifyer/           Phase 3 — recipients, messaging, handoff, scheduling, notes
    SKILL.md
    scripts/
    references/
    assets/
```

Each phase is also published separately on ClawHub as an individual skill
(`setup-notifyer`, `automate-notifyer`, `chat-notifyer`) under the `@whatsable` namespace.
