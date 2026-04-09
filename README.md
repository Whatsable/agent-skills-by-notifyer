# Notifyer Agent Skills

<img src="https://res.cloudinary.com/subframe/image/upload/v1756457825/uploads/4086/b4ynd9jid16pcby8cfz0.svg" alt="Notifyer by WhatsAble" height="40" />

> **v0.3.0 — All three phases complete.** `setup-notifyer`, `automate-notifyer`, and `chat-notifyer` are all production-ready.

Agent Skills for [Notifyer by WhatsAble](https://notifyer-systems.com) — built on the open [AgentSkills](https://agentskills.io) format. These skills teach AI coding agents how to authenticate, configure, and operate a Notifyer workspace programmatically, using the same API surface as the Notifyer Console and Chat applications.

Works across any compatible agent — **OpenClaw, Cursor, Claude Code, GitHub Copilot, Gemini CLI, Amp, Roo Code, Junie, OpenHands**, and [many more](https://agentskills.io).

---

## Table of Contents

- [What is this?](#what-is-this)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Authentication Modes](#authentication-modes)
- [Available Skills](#available-skills)
- [Script Reference — setup-notifyer](#script-reference--setup-notifyer)
- [Script Reference — automate-notifyer](#script-reference--automate-notifyer)
- [Script Reference — chat-notifyer](#script-reference--chat-notifyer)
- [Use Cases — What AI Agents Can Do](#use-cases--what-ai-agents-can-do)
- [Limitations](#limitations)
- [Repository Structure](#repository-structure)
- [AgentSkills Format](#agentskills-format)
- [Learn More](#learn-more)

---

## What is this?

Notifyer is a WhatsApp Business automation platform by WhatsAble. It lets businesses connect their WhatsApp Business number, build message templates, manage team inboxes with labels and roles, run AI chatbots, send automated broadcasts, and integrate with Make, Zapier, n8n, or a direct developer API.

This repository packages Notifyer's full management and chat capabilities as **Agent Skills** — a standardised, agent-readable format that any compatible AI coding agent can discover and use. Agents that load these skills can set up, configure, automate, and operate Notifyer workspaces as part of larger automated workflows, without ever opening the browser console.

---

## Requirements

- **Node.js >= 18** (uses native `fetch` and ESM imports — no dependencies)
- A Notifyer account at [console.notifyer-systems.com](https://console.notifyer-systems.com)
- For API key usage (Make/Zapier/n8n integrations): a **Pro or Agency** subscription

---

## Installation

### With a compatible agent (recommended)

If your agent supports the AgentSkills format, point it to this repository:

```bash
npx skills add whatsable/agent-skills-by-notifyer
```

The agent will discover all available skills and load them on demand.

### Manual clone

```bash
git clone https://github.com/Whatsable/agent-skills-by-notifyer
cd agent-skills-by-notifyer
```

Each skill is self-contained — no external dependencies. Run scripts directly with Node.js 18+.

---

## Quick Start

**Step 1 — Set the API base URL:**

```bash
export NOTIFYER_API_BASE_URL="https://api.insightssystem.com"
```

**Step 2 — Log in and capture your token:**

```bash
cd skills/setup-notifyer
node scripts/login.js --email you@example.com --password "YourPassword@1"
# Output: { "ok": true, "data": { "authToken": "eyJ..." } }
export NOTIFYER_API_TOKEN="eyJ..."
```

**Step 3 — Verify identity and connection:**

```bash
node scripts/get-me.js --pretty
node scripts/get-connection-status.js --pretty
```

You are now ready to run scripts from any of the three skills. The same `NOTIFYER_API_TOKEN` works across all skills.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOTIFYER_API_BASE_URL` | **yes** | — | API host — always `https://api.insightssystem.com` |
| `NOTIFYER_API_TOKEN` | **yes** (most scripts) | — | JWT from `login.js`. Not needed for `create-account.js` or `login.js` themselves. |
| `NOTIFYER_CHAT_ORIGIN` | no | `https://chat.notifyer-systems.com` | CORS `Origin` header for chat endpoints. Only needed if your Notifyer instance uses a different domain. |

All variables are loaded by `scripts/lib/notifyer-api.js`. If a required variable is missing, the script exits immediately with a clear error.

### Persisting across sessions

```bash
# Add to ~/.zshrc or ~/.bashrc
export NOTIFYER_API_BASE_URL="https://api.insightssystem.com"
export NOTIFYER_API_TOKEN="eyJ..."
```

Tokens are JWTs with an expiry. If a script returns HTTP 401, re-run `login.js` to refresh.

---

## Authentication Modes

Notifyer's backend uses **three distinct auth modes** depending on which API surface is called. All scripts handle this automatically — you only ever set `NOTIFYER_API_TOKEN` once.

| Mode | Header Format | Used By |
|------|--------------|---------|
| **Console** | `Authorization: Bearer <jwt>` | `setup-notifyer` + most of `automate-notifyer` |
| **Chat** | `Authorization: <jwt>` (raw, no prefix) | `chat-notifyer` + label scripts |
| **Developer** | `Authorization: <api_key>` (raw) | External tools: Make, Zapier, n8n |

The **same JWT** from `login.js` works for both Console and Chat modes — only the header format differs. Scripts automatically select the correct mode. The Developer API key is a separate credential retrieved with `get-api-key.js`.

---

## Available Skills

| Skill | Status | Phase | Description |
|-------|--------|-------|-------------|
| [`setup-notifyer`](skills/setup-notifyer/) | **Production-ready** | 1 | Account, WhatsApp connection, plans, team & roles, labels, Developer API key |
| [`automate-notifyer`](skills/automate-notifyer/) | **Production-ready** | 2 | Templates, AI bots, broadcasts, analytics, webhooks |
| [`chat-notifyer`](skills/chat-notifyer/) | **Production-ready** | 3 | Recipients, messaging, labels, AI handoff, scheduled messages, notes |

All three skills use the same `NOTIFYER_API_TOKEN`. Run scripts from within each skill's directory.

---

## Script Reference — setup-notifyer

```bash
cd skills/setup-notifyer
node scripts/<script>.js [flags]
```

### Account

| Script | Description |
|--------|-------------|
| `create-account.js` | Create a new Notifyer workspace |
| `login.js` | Login and get a JWT auth token |
| `get-me.js` | Get the authenticated user's profile |

```bash
node scripts/create-account.js --name "Jane" --email jane@co.com --password "Pass@1"
node scripts/login.js --email jane@co.com --password "Pass@1"
node scripts/get-me.js --pretty
```

### WhatsApp Connection

| Script | Description |
|--------|-------------|
| `get-connection-status.js` | Check Meta registration and subscription status |
| `refresh-connection.js` | Force re-sync with Meta's WhatsApp Business API |

```bash
node scripts/get-connection-status.js --pretty
node scripts/refresh-connection.js --pretty
```

> **Note:** Initial WhatsApp connection (QR scan / embedded signup) must be done once via the Notifyer console UI. These scripts manage the connection after it is established.

### Plans & Usage

| Script | Description |
|--------|-------------|
| `list-plans.js` | List all subscription plans and pricing tiers |
| `get-user-plan.js` | Current subscription status and usage limits |

```bash
node scripts/list-plans.js --pretty
node scripts/get-user-plan.js --pretty
```

### Team & Roles

| Script | Description |
|--------|-------------|
| `list-members.js` | List all team members |
| `invite-member.js` | Create a team member account |
| `update-member.js` | Update role, labels, name, or password |
| `remove-member.js` | Permanently remove a team member |

```bash
node scripts/list-members.js --labels --pretty
node scripts/invite-member.js --name "John" --email john@co.com --password "Pass@1" --role "Team Member" --labels "Sales,Support"
node scripts/update-member.js --id <uuid> --role Admin
node scripts/remove-member.js --id <uuid> --confirm
```

Roles: `Admin` | `Team Member (All Labels)` | `Team Member`

### Labels

| Script | Description |
|--------|-------------|
| `list-labels.js` | List workspace labels |
| `create-label.js` | Create a label with optional auto-assignment keywords |
| `update-label-keywords.js` | Update label name or keywords |
| `delete-label.js` | Permanently delete a label |

```bash
node scripts/create-label.js --label "Sales" --keywords "buy,pricing,quote"
node scripts/update-label-keywords.js --id 5 --add "urgent"
node scripts/delete-label.js --id 5 --confirm
```

### Developer API Key

| Script | Description |
|--------|-------------|
| `get-api-key.js` | Retrieve the Developer API key for Make/Zapier/n8n |

```bash
node scripts/get-api-key.js --pretty
```

> Pro or Agency plan required. Use the **"Notifyer Systems"** module in Make/Zapier.

---

## Script Reference — automate-notifyer

```bash
cd skills/automate-notifyer
node scripts/<script>.js [flags]
```

### Templates

| Script | Description |
|--------|-------------|
| `list-templates.js` | List all approved and pending templates |
| `get-template.js` | Fetch a single template by name or ID |
| `create-template.js` | Submit a template for Meta approval |
| `delete-template.js` | Permanently delete a template from Notifyer + Meta (`--confirm` required) |

```bash
node scripts/list-templates.js --pretty
node scripts/create-template.js --name "order_confirm" --category UTILITY --body "Hello {{1}}, your order {{2}} is confirmed." --variables 2
node scripts/delete-template.js --id 987654321 --confirm   # whatsapp_template_id from list-templates.js
```

> **Side effect:** `list-templates.js` auto-syncs PENDING templates from Meta on each call.

### AI Bots

| Script | Description |
|--------|-------------|
| `list-bots.js` | List all AI bots |
| `get-bot.js` | Fetch a single bot by ID |
| `create-bot.js` | Create an AI bot (backed by OpenAI Assistant) |
| `update-bot.js` | Update bot fields (name, tone, knowledge base, delay, etc.) |
| `set-default-bot.js` | Set a bot as the workspace default |
| `delete-bot.js` | Permanently delete a bot + its OpenAI Assistant (`--confirm` required) |

```bash
node scripts/list-bots.js --pretty
node scripts/create-bot.js --name "Support Bot" --mission "Help users with support queries." --tone "Friendly" --default
node scripts/update-bot.js --id 12 --tone "Professional" --delay 5
node scripts/set-default-bot.js --id 12
node scripts/delete-bot.js --id 12 --confirm
```

### Broadcasts

| Script | Description |
|--------|-------------|
| `list-broadcasts.js` | List broadcasts by status (upcoming/previous/ongoing) |
| `get-broadcast.js` | Fetch a single broadcast by ID or name |
| `create-broadcast.js` | Create and schedule a broadcast (3-step flow) |
| `delete-broadcast.js` | Cancel/delete an upcoming broadcast (`--confirm` required) |

```bash
node scripts/list-broadcasts.js --require upcoming --pretty
node scripts/create-broadcast.js \
  --name "Jan Promo" \
  --template tmpl_abc123 \
  --recipients recipients.csv \
  --schedule "25/01/2025 10:00"
node scripts/delete-broadcast.js --id 5 --confirm
```

### Analytics

| Script | Description |
|--------|-------------|
| `get-message-analytics.js` | Summary stats — sent, delivered, read rates |
| `get-message-logs.js` | Per-message logs with phone/type filter |

```bash
node scripts/get-message-analytics.js --from "01/01/2025" --to "31/01/2025" --pretty
node scripts/get-message-logs.js --phone 14155550123 --pretty
```

### Webhooks

| Script | Description |
|--------|-------------|
| `list-webhooks.js` | List dev or IO webhooks (`--type dev\|io`) |
| `create-webhook.js` | Create a webhook with triggers and optional HMAC signature |
| `update-webhook.js` | Update URL, status, or triggers (fetch-then-patch) |
| `delete-webhook.js` | Delete a webhook (`--confirm` required) |

```bash
node scripts/list-webhooks.js --type dev --pretty
node scripts/create-webhook.js --type dev --url https://my.app/webhook --incoming --outgoing --signature
node scripts/delete-webhook.js --type dev --id 3 --confirm
```

---

## Script Reference — chat-notifyer

```bash
cd skills/chat-notifyer
node scripts/<script>.js [flags]
```

### Recipients

| Script | Description |
|--------|-------------|
| `list-recipients.js` | List/search all conversation contacts |
| `get-recipient.js` | Fetch a single recipient by phone number |
| `filter-recipients-by-label.js` | List recipients filtered by label(s) |
| `update-recipient.js` | Update recipient display name |

```bash
node scripts/list-recipients.js --search "John" --pretty
node scripts/get-recipient.js --phone 14155550123 --pretty
node scripts/filter-recipients-by-label.js --labels "Support" --status unread --pretty
node scripts/update-recipient.js --phone 14155550123 --name "John Doe"
```

### Messaging

| Script | Description |
|--------|-------------|
| `send-text.js` | Send a free-text message (24h window required) |
| `send-template.js` | Send a template message (works any time) |
| `send-attachment.js` | Upload a file and send it as a media message |

```bash
# Check 24h window first:
node scripts/get-recipient.js --phone 14155550123 --pretty

# Send text (window open):
node scripts/send-text.js --phone 14155550123 --text "Hello! How can I help?"

# Send template (works even if window closed):
node scripts/send-template.js --phone 14155550123 --template tmpl_abc123 \
  --variables '{"body1":"John","body2":"#12345"}'

# Send attachment:
node scripts/send-attachment.js --phone 14155550123 --file ./invoice.pdf --pretty
```

> **24h Window Rule:** WhatsApp only allows free-text and attachment messages within 24 hours of the recipient's last inbound message. When the window is closed, use `send-template.js`.

### Labels

| Script | Description |
|--------|-------------|
| `assign-label.js` | Assign a label to a recipient conversation |
| `remove-label.js` | Remove a label from a recipient conversation |

```bash
node scripts/assign-label.js --phone 14155550123 --label "Support" --pretty
node scripts/remove-label.js --phone 14155550123 --label "Support" --pretty
```

### AI Handoff

| Script | Description |
|--------|-------------|
| `set-handoff.js` | Toggle AI bot ↔ human agent mode |
| `assign-bot.js` | Assign a specific AI bot to a recipient |
| `list-bots.js` | List all AI bots (get IDs for assign-bot.js) |

```bash
# Human takes over:
node scripts/set-handoff.js --phone 14155550123 --mode human --pretty

# Return to bot:
node scripts/set-handoff.js --phone 14155550123 --mode bot

# Assign a specific bot:
node scripts/list-bots.js --pretty
node scripts/assign-bot.js --phone 14155550123 --bot-id 5
```

### Scheduled Messages

| Script | Description |
|--------|-------------|
| `list-scheduled.js` | View all queued scheduled messages |
| `delete-scheduled.js` | Cancel a scheduled message |

```bash
# Schedule a message (works with send-text, send-template, send-attachment):
node scripts/send-template.js --phone 14155550123 --template tmpl_abc123 --schedule "25/01/2025 14:00"

# Manage scheduled messages:
node scripts/list-scheduled.js --pretty
node scripts/delete-scheduled.js --id 7 --confirm
```

### Notes & Conversation History

| Script | Description |
|--------|-------------|
| `add-note.js` | Set, append, or clear the manual note on a recipient |
| `get-notes.js` | Read manual + AI-generated notes |
| `get-conversation.js` | Read full bidirectional chat thread (sent + received messages) |
| `get-conversation-log.js` | Read outbound-only send history with delivery status |

```bash
node scripts/get-notes.js --phone 14155550123 --pretty
node scripts/add-note.js --phone 14155550123 --note "VIP — apply 15% discount"
node scripts/add-note.js --phone 14155550123 --append "Follow up on 15 Feb"
node scripts/get-conversation.js --phone 14155550123 --pretty          # full thread (both sides)
node scripts/get-conversation-log.js --phone 14155550123 --all --pretty # outbound only
```

---

## Use Cases — What AI Agents Can Do

### Workspace Onboarding Automation

An agent can fully onboard a new Notifyer workspace:

1. `create-account.js` — create the workspace
2. `login.js` — get the auth token
3. `get-user-plan.js` — verify subscription is active
4. `get-connection-status.js` — confirm WhatsApp is connected
5. `create-label.js` — create labels (`Sales`, `Support`, `VIP`)
6. `invite-member.js` — add team members
7. `update-member.js --labels` — assign labels to each member
8. `get-api-key.js` — retrieve the developer key for Make/Zapier/n8n

A single prompt like *"Set up a Notifyer workspace for Acme Corp with a Sales team of 3 agents"* can drive all 8 steps.

---

### Template Lifecycle Management

```bash
# Create a template
node scripts/create-template.js --name "order_shipped" --category UTILITY \
  --body "Hi {{1}}, your order {{2}} has shipped!" --variables 2

# Monitor approval status
node scripts/list-templates.js --pretty   # auto-syncs PENDING status from Meta

# Use the approved template in a broadcast
node scripts/create-broadcast.js --template order_shipped --recipients customers.csv \
  --schedule "25/01/2025 09:00"
```

---

### Full Chat Operation Workflow

```bash
# 1. Check who needs attention (unread, high-priority label)
node scripts/filter-recipients-by-label.js --labels "VIP" --status unread --pretty

# 2. Get full context on a contact
node scripts/get-recipient.js --phone 14155550123 --pretty
node scripts/get-notes.js --phone 14155550123 --pretty
node scripts/get-conversation.js --phone 14155550123 --pretty          # full thread (sent + received)
node scripts/get-conversation-log.js --phone 14155550123 --pretty      # outbound delivery log

# 3. Take over from the bot and respond
node scripts/set-handoff.js --phone 14155550123 --mode human
node scripts/send-text.js --phone 14155550123 --text "Hi John! I'm looking into this now."

# 4. Update notes with context
node scripts/add-note.js --phone 14155550123 --note "Escalated — awaiting refund approval"

# 5. Assign the right label and return to bot
node scripts/assign-label.js --phone 14155550123 --label "Escalated"
node scripts/set-handoff.js --phone 14155550123 --mode bot
```

---

### AI-Driven Customer Support Triage

An agent can continuously process incoming conversations:

1. `list-recipients.js --status unread` — find new conversations
2. `get-recipient.js` — check 24h window and AI mode status
3. `get-notes.js` — load context (manual + AI notes)
4. `get-conversation.js` — read full bidirectional thread (sent + received)
5. `get-conversation-log.js` — read outbound delivery log
6. Decide: escalate, respond, or route
7. `assign-label.js` — categorise the conversation
8. `send-template.js` — send an acknowledgement if window is closed
9. `set-handoff.js --mode human` — escalate complex cases

---

### Broadcast Campaign Management

```bash
# Plan and schedule a campaign
node scripts/list-templates.js --pretty         # pick an approved template
node scripts/get-user-plan.js --pretty          # check usage limits
node scripts/create-broadcast.js \
  --name "Feb Promo" \
  --template tmpl_promo \
  --recipients customers.csv \
  --schedule "01/02/2025 10:00"

# Monitor in progress
node scripts/list-broadcasts.js --require ongoing --pretty

# Review results
node scripts/get-message-analytics.js --from "01/02/2025" --to "28/02/2025" --pretty
node scripts/get-message-logs.js --filter broadcast --pretty
```

---

### Pre-flight Checks Before Sending

Before any automation sends a message, an agent should gate on:

```bash
node scripts/get-connection-status.js   # WhatsApp connected?
node scripts/get-user-plan.js           # subscription active, within limits?
node scripts/get-recipient.js --phone <n> --pretty  # 24h window open?
```

This prevents failed sends and surfaces issues (stale connection, expired subscription, closed window) proactively.

---

### Webhook + Automation Integration

```bash
# Set up an outgoing webhook to receive message events
node scripts/create-webhook.js --type dev --url https://my.app/hook --incoming --outgoing --signature

# Set up an IO webhook for Make/Zapier/n8n event-driven automations
node scripts/create-webhook.js --type io --url https://hook.eu2.make.com/xyz --outgoing --schedule-activity

# Monitor configured webhooks
node scripts/list-webhooks.js --type dev --pretty
node scripts/list-webhooks.js --type io --pretty
```

---

### Workspace Health Check

```bash
node scripts/get-me.js --pretty                  # token valid?
node scripts/get-connection-status.js --pretty   # WhatsApp live?
node scripts/get-user-plan.js --pretty           # plan active, usage OK?
node scripts/list-members.js --pretty            # team structure
node scripts/list-labels.js --pretty             # label inventory
node scripts/list-bots.js --pretty               # AI bots active?
node scripts/list-webhooks.js --type dev --pretty # webhooks configured?
```

All outputs are structured JSON — trivially pipeable to monitoring tools or dashboards.

---

## Limitations

### Hard Limits (cannot be scripted by design)

| Limitation | Details |
|-----------|---------|
| **WhatsApp initial connection is browser-only** | The QR scan / embedded signup (Meta OAuth flow) requires a browser. An agent can check and refresh an existing connection, but cannot perform the first-time WABA setup. Direct users to [console.notifyer-systems.com](https://console.notifyer-systems.com). |
| **Plan upgrades/downgrades require the console UI** | Stripe checkout requires a browser redirect. `list-plans.js` and `get-user-plan.js` are read-only. |
| **Template approval is Meta's process** | `create-template.js` submits to Meta. Approval takes 24–72 hours and cannot be expedited via API. Templates must reach `APPROVED` status before use. |
| **Templates cannot be edited after approval** | Create a new template with a different name. There is no update-template endpoint. |
| **Deleting a broadcast cannot recall messages already sent** | `delete-broadcast.js` stops future batches but does not undo messages already dispatched. Only use it on upcoming (not yet started) broadcasts. |
| **AI bot requires OpenAI API key in Notifyer settings** | `create-bot.js` fails if the workspace has no valid OpenAI key — set this in the console UI. |
| **Password recovery is browser-only** | No password reset API endpoint. |

### API & Messaging Constraints

| Limitation | Details |
|-----------|---------|
| **24h window enforced by WhatsApp server-side** | Scripts cannot bypass it. Use `send-template.js` when the window is closed. |
| **Outbound-only message history** | `get-conversation-log.js` shows messages sent by Notifyer. Inbound messages from customers are not in the log — view them in [chat.notifyer-systems.com](https://chat.notifyer-systems.com). |
| **No bulk send from chat scripts** | For bulk messaging, use `automate-notifyer/create-broadcast.js`. |
| **`note_auto` (AI note) is read-only** | AI-generated notes are written by Notifyer's internal AI — cannot be set or cleared via API. |
| **`DELETE /webhook/dev/:id` has no server-side user auth in Xano** | `delete-webhook.js` mitigates this with an ownership check (authenticated `GET` before `DELETE`). The raw API endpoint remains public — a Xano-side fix is still recommended. |
| **IO webhook ID is a text UUID** | Unlike integer dev webhook IDs. Always treat IO webhook IDs as strings. |
| **No token refresh endpoint** | When the JWT expires (HTTP 401), re-run `login.js` for a fresh token. |

### Role Constraints

| Limitation | Details |
|-----------|---------|
| **Super Admin role is immutable** | Cannot be modified, demoted, or deleted by any script. |
| **Email is immutable after account creation** | Team member email addresses cannot be changed. |
| **Team Member token restricts recipient visibility** | Xano server-side filters recipients to the member's assigned label scope — scripts cannot override this. |
| **Label deletion does not cascade** | When a label is deleted, members with that label assigned are NOT automatically updated. Run `update-member.js --labels` to reassign them. |
| **API key requires Pro or Agency plan** | Basic (Bulk Message) accounts cannot use the Developer API or Make/Zapier/n8n. |

---

## Repository Structure

```
agent-skills-by-notifyer/
├── README.md
└── skills/
    ├── setup-notifyer/                     ← Phase 1: workspace setup & infra
    │   ├── SKILL.md                        ← Agent entrypoint
    │   ├── package.json
    │   ├── scripts/
    │   │   ├── lib/                        ← Shared: notifyer-api.js, args.js, result.js
    │   │   ├── create-account.js
    │   │   ├── login.js
    │   │   ├── get-me.js
    │   │   ├── get-connection-status.js
    │   │   ├── refresh-connection.js
    │   │   ├── list-plans.js
    │   │   ├── get-user-plan.js
    │   │   ├── list-members.js
    │   │   ├── invite-member.js
    │   │   ├── update-member.js
    │   │   ├── remove-member.js
    │   │   ├── list-labels.js
    │   │   ├── create-label.js
    │   │   ├── update-label-keywords.js
    │   │   ├── delete-label.js
    │   │   └── get-api-key.js
    │   ├── references/                     ← API docs per feature area
    │   └── assets/                         ← Example payloads
    │
    ├── automate-notifyer/                  ← Phase 2: automation & integrations
    │   ├── SKILL.md
    │   ├── package.json
    │   ├── scripts/
    │   │   ├── lib/
    │   │   ├── list-templates.js
    │   │   ├── get-template.js
    │   │   ├── create-template.js
    │   │   ├── delete-template.js
    │   │   ├── list-bots.js
    │   │   ├── get-bot.js
    │   │   ├── create-bot.js
    │   │   ├── update-bot.js
    │   │   ├── delete-bot.js
    │   │   ├── set-default-bot.js
    │   │   ├── list-broadcasts.js
    │   │   ├── get-broadcast.js
    │   │   ├── create-broadcast.js
    │   │   ├── delete-broadcast.js
    │   │   ├── get-message-analytics.js
    │   │   ├── get-message-logs.js
    │   │   ├── list-webhooks.js
    │   │   ├── create-webhook.js
    │   │   ├── update-webhook.js
    │   │   └── delete-webhook.js
    │   ├── references/
    │   └── assets/
    │
    └── chat-notifyer/                      ← Phase 3: live chat operations
        ├── SKILL.md
        ├── package.json
        ├── scripts/
        │   ├── lib/
        │   ├── list-recipients.js
        │   ├── get-recipient.js
        │   ├── filter-recipients-by-label.js
        │   ├── update-recipient.js
        │   ├── send-text.js
        │   ├── send-template.js
        │   ├── send-attachment.js
        │   ├── assign-label.js
        │   ├── remove-label.js
        │   ├── set-handoff.js
        │   ├── assign-bot.js
        │   ├── list-bots.js
        │   ├── list-scheduled.js
        │   ├── delete-scheduled.js
        │   ├── add-note.js
        │   ├── get-notes.js
        │   ├── get-conversation.js
        │   └── get-conversation-log.js
        ├── references/
        └── assets/
```

---

## AgentSkills Format

This package follows the [AgentSkills open standard](https://agentskills.io/specification). Each skill is a directory with a `SKILL.md` file at the root. The frontmatter declares metadata; the body provides instructions, how-tos, rules, and a file map.

```
my-skill/
├── SKILL.md          # Required: instructions + metadata
├── scripts/          # Executable wrappers around API endpoints
├── references/       # Detailed API documentation
└── assets/           # Example payloads and fixtures
```

Skills use **progressive disclosure**: agents load only the skill name and description at startup. The full `SKILL.md` — and any referenced scripts or docs — is loaded only when the agent determines it is relevant to the current task.

Compatible agents (partial list): OpenClaw, Cursor, Claude Code, GitHub Copilot, VS Code, Gemini CLI, Amp, Roo Code, Junie, OpenHands, Mux, Goose, Letta, Firebender, Factory, Piebald, TRAE, Spring AI, and [many more](https://agentskills.io).

---

## Learn More

| Resource | Link |
|----------|------|
| Notifyer Console | [console.notifyer-systems.com](https://console.notifyer-systems.com) |
| Notifyer Chat | [chat.notifyer-systems.com](https://chat.notifyer-systems.com) |
| Notifyer Documentation | [docs.whatsable.app](https://docs.whatsable.app) |
| AgentSkills specification | [agentskills.io/specification](https://agentskills.io/specification) |
| WhatsAble | [notifyer-systems.com](https://notifyer-systems.com) |

---

*Proprietary — © WhatsAble. All rights reserved.*
