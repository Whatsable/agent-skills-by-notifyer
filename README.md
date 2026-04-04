# Notifyer Agent Skills

<img src="https://res.cloudinary.com/subframe/image/upload/v1756457825/uploads/4086/b4ynd9jid16pcby8cfz0.svg" alt="Notifyer by WhatsAble" height="40" />

> **v0.1.0 — Phase 1 complete.** The `setup-notifyer` skill is production-ready. Skills for `automate-notifyer` and `chat-notifyer` are planned for Phase 2.

Agent Skills for [Notifyer by WhatsAble](https://notifyer-systems.com) — built on the open [AgentSkills](https://agentskills.io) format. These skills teach AI coding agents how to authenticate, configure, and manage a Notifyer workspace programmatically, using the same API surface as the Notifyer Console and Chat applications.

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
- [Use Cases — What AI Agents Can Do](#use-cases--what-ai-agents-can-do)
- [Limitations](#limitations)
- [Repository Structure](#repository-structure)
- [AgentSkills Format](#agentskills-format)
- [Learn More](#learn-more)

---

## What is this?

Notifyer is a WhatsApp Business automation platform by WhatsAble. It lets businesses connect their WhatsApp Business number, build message templates, manage team inboxes with labels and roles, run AI chatbots, and send automated messages through Make, Zapier, n8n, or a direct developer API.

This repository packages Notifyer's management capabilities as **Agent Skills** — a standardized, agent-readable format that any compatible AI coding agent can discover and use. Agents that load these skills can set up, configure, and manage Notifyer workspaces as part of larger automated workflows, without ever opening the browser console.

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
npx skills add whatsable/notifyer-agent-skills
```

The agent will discover all available skills and load them on demand.

### Manual clone

```bash
git clone https://github.com/whatsable/notifyer-agent-skills
cd notifyer-agent-skills/skills/setup-notifyer
npm install   # no external dependencies; this sets up the package manifest only
```

---

## Quick Start

**Step 1 — Set the API base URL:**

```bash
export NOTIFYER_API_BASE_URL="https://api.insightssystem.com"
```

**Step 2 — Log in and capture your token:**

```bash
node scripts/login.js --email you@example.com --password "YourPassword@1"
# Output: { "ok": true, "data": { "authToken": "eyJ..." } }
export NOTIFYER_API_TOKEN="eyJ..."
```

**Step 3 — Verify your identity:**

```bash
node scripts/get-me.js
# Output: { "ok": true, "data": { "id": 1, "name": "Jane Smith", "role": "Super Admin", ... } }
```

**Step 4 — Check your WhatsApp connection:**

```bash
node scripts/get-connection-status.js --pretty
```

**Step 5 — List your workspace labels:**

```bash
node scripts/list-labels.js --pretty
```

You are now ready to run any script in the `setup-notifyer` skill.

---

## Environment Variables

Set these before running any script:

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTIFYER_API_BASE_URL` | Yes | API host — always `https://api.insightssystem.com` |
| `NOTIFYER_API_TOKEN` | Yes (most scripts) | JWT from `login.js`. Not needed for `create-account.js` or `login.js` themselves. |

Both variables are loaded by `scripts/lib/notifyer-api.js` at runtime. If either is missing, the script exits immediately with a clear error message.

### Persisting the token across sessions

Add these lines to your shell profile (`~/.zshrc`, `~/.bashrc`, or `~/.profile`):

```bash
export NOTIFYER_API_BASE_URL="https://api.insightssystem.com"
export NOTIFYER_API_TOKEN="eyJ..."   # replace with your token
```

Tokens are JWTs with an expiry. If a script returns HTTP 401, run `login.js` again to refresh.

---

## Authentication Modes

Notifyer's backend uses **three distinct authentication modes** depending on which API surface is called. All scripts handle this automatically — you only ever set `NOTIFYER_API_TOKEN` once.

| Mode | Header Format | Used For |
|------|--------------|----------|
| **Console** | `Authorization: Bearer <jwt>` | Account management, team, plans, WhatsApp status, API key retrieval |
| **Chat** | `Authorization: <jwt>` (raw, no prefix) | Label CRUD (`/api:bVXsw_FD/web/label_management`), chat surface endpoints |
| **Developer** | `Authorization: <api_key>` (raw, no prefix) | External automation — Make, Zapier, n8n, `send_template_message_by_api` |

The `NOTIFYER_API_TOKEN` (the JWT from `login.js`) is used for both Console and Chat modes. The Developer API key is a **separate credential** retrieved with `get-api-key.js`. It is used by third-party tools, not by these scripts directly.

---

## Available Skills

| Skill | Status | Description |
|-------|--------|-------------|
| `setup-notifyer` | **Production-ready** | Account creation, login, WhatsApp connection, plans, team & roles, labels, Developer API key |
| `automate-notifyer` | Planned (Phase 2) | Templates, AI bots, broadcasts, analytics, webhooks |
| `chat-notifyer` | Planned (Phase 2) | Send messages, conversation labels, chat handoff, scheduled messages, notes |

---

## Script Reference — setup-notifyer

All scripts are in `skills/setup-notifyer/scripts/`. Run from the `setup-notifyer` directory:

```bash
cd skills/setup-notifyer
node scripts/<script-name>.js [flags]
```

All scripts output **structured JSON** to stdout and human-readable summaries to stderr (with `--pretty`). Pipe stdout to `jq` for further processing.

### Account

| Script | Endpoint | Description |
|--------|----------|-------------|
| `create-account.js` | `POST /api:-4GSCDHb/auth/signup` | Create a new Notifyer workspace account |
| `login.js` | `POST /api:-4GSCDHb/auth/login` | Login and get a JWT auth token |
| `get-me.js` | `GET /api:-4GSCDHb/auth/me` | Get the authenticated user's profile |

```bash
# Create a new account
node scripts/create-account.js \
  --name "Jane Smith" \
  --email jane@company.com \
  --password "Secure@123" \
  --phone 14155550123 \
  --reason "Automate customer support"   # optional

# Login
node scripts/login.js --email jane@company.com --password "Secure@123"

# Get current user
node scripts/get-me.js
```

### WhatsApp Connection

| Script | Endpoint | Description |
|--------|----------|-------------|
| `get-connection-status.js` | `GET /api:P5grzx1u/is_user_embedded` | Check Meta registration and subscription status |
| `refresh-connection.js` | `POST /api:P5grzx1u/refresher_of_registration_subscription` | Force re-sync with Meta's WhatsApp Business API |

```bash
node scripts/get-connection-status.js --pretty
node scripts/refresh-connection.js --pretty
```

### Plans & Usage

| Script | Endpoint | Description |
|--------|----------|-------------|
| `list-plans.js` | `GET /api:JZAUyiCs/plans?filter=…` | List all subscription plans and pricing tiers |
| `get-user-plan.js` | `GET /api:JZAUyiCs/user_plan` | Current subscription status and usage |

```bash
node scripts/list-plans.js --pretty
node scripts/list-plans.js --tier pro --billing monthly
node scripts/get-user-plan.js --pretty
```

### Team & Roles

| Script | Endpoint | Description |
|--------|----------|-------------|
| `list-members.js` | `GET /api:-4GSCDHb/auth/get_team_member` | List all team members |
| `invite-member.js` | `POST /api:-4GSCDHb/auth/create_team_member` | Create a team member account |
| `update-member.js` | `PATCH /api:-4GSCDHb/auth/user` | Update role, labels, name, or password |
| `remove-member.js` | `DELETE /api:-4GSCDHb/auth/delete_team_member/:id` | Permanently remove a team member |

```bash
# List members with available labels
node scripts/list-members.js --labels --pretty

# Add a team member
node scripts/invite-member.js \
  --name "John Doe" \
  --email john@company.com \
  --password "Secure@2024" \
  --role "Team Member" \
  --labels "Sales,Support"

# Change role
node scripts/update-member.js --id <uuid> --role Admin

# Assign labels (replaces current list)
node scripts/update-member.js --id <uuid> --labels "VIP,Support"

# Remove member (requires confirmation)
node scripts/remove-member.js --id <uuid> --confirm
```

Roles: `Admin` | `Team Member (All Labels)` | `Team Member`. `Super Admin` is the account owner and cannot be modified.

### Labels

| Script | Endpoint | Description |
|--------|----------|-------------|
| `list-labels.js` | `GET /api:bVXsw_FD/web/label_management` | List workspace labels (role-filtered) |
| `create-label.js` | `POST /api:bVXsw_FD/web/label_management` | Create a new label |
| `update-label-keywords.js` | `PATCH /api:bVXsw_FD/web/label_management/:id` | Update label name or keywords |
| `delete-label.js` | `DELETE /api:bVXsw_FD/web/label_management/:id` | Permanently delete a label |

```bash
# List labels
node scripts/list-labels.js --pretty

# Create a label with auto-assignment keywords
node scripts/create-label.js --label "Sales" --keywords "buy,purchase,pricing,quote"

# Add keywords to an existing label
node scripts/update-label-keywords.js --id 5 --add "urgent,priority"

# Remove a keyword
node scripts/update-label-keywords.js --id 5 --remove "old-keyword"

# Replace all keywords
node scripts/update-label-keywords.js --id 5 --set "buy,order"

# Rename a label
node scripts/update-label-keywords.js --id 5 --label "VIP Customers"

# Delete (requires confirmation)
node scripts/delete-label.js --id 5 --confirm
```

> Labels use **chat auth** — the same `NOTIFYER_API_TOKEN` works; `notifyer-api.js` handles the header format difference automatically.

### Developer API Key

| Script | Endpoint | Description |
|--------|----------|-------------|
| `get-api-key.js` | `GET /api:-4GSCDHb/api_key` | Retrieve the Developer API key for Make/Zapier/n8n |

```bash
node scripts/get-api-key.js
node scripts/get-api-key.js --pretty   # prints key to stderr for easy copying
```

> **Pro or Agency plan required** to use the API key with Make/Zapier/n8n. Basic (Bulk Message) accounts are blocked. Check eligibility with `get-user-plan.js`.
>
> When setting up Make or Zapier, use the **"Notifyer Systems"** module — not the "WhatsAble" module.

---

## Use Cases — What AI Agents Can Do

The following workflows are fully achievable today with Phase 1 scripts.

### Workspace Onboarding Automation

An agent can fully onboard a new Notifyer workspace without any manual browser interaction:

1. **Create the account** — `create-account.js`
2. **Log in and capture the token** — `login.js`
3. **Verify identity** — `get-me.js`
4. **Check plan status** — `get-user-plan.js` (confirm `status` is `active` or `trialing`)
5. **Check WhatsApp connection** — `get-connection-status.js` (confirm `isConnected: true`)
6. **Create workspace labels** — `create-label.js` (e.g. `Sales`, `Support`, `VIP`)
7. **Add team members** — `invite-member.js` for each member
8. **Assign labels to members** — `update-member.js --labels`
9. **Retrieve Developer API key** — `get-api-key.js`

A single agent prompt like *"Set up a Notifyer workspace for Acme Corp with a Sales team of 3 agents"* can drive all 9 steps automatically.

---

### Dynamic Team Management

An agent can manage team structure in response to real business events:

- **On-board a new hire**: `invite-member.js` → `update-member.js --labels` — account is live in seconds
- **Promote an agent**: `update-member.js --role Admin` — access is updated immediately
- **Reassign on sick leave**: `update-member.js --labels "Urgent"` — reroute conversations to available agents
- **Off-board an employee**: `list-members.js` to find ID → `remove-member.js --confirm`
- **Audit team structure**: `list-members.js --labels --pretty` — see all roles and label assignments at a glance

---

### Label Taxonomy Management

Labels are the core routing mechanism in Notifyer Chat. An agent can manage the full taxonomy:

- **Bootstrap labels from a CRM category list**: loop `create-label.js` per category
- **Set keyword triggers**: `create-label.js --keywords "buy,price,quote"` — conversations are auto-labeled on arrival
- **Refine keywords over time**: `update-label-keywords.js --add "deal,offer"` without disturbing existing assignments
- **Rename a label without losing history**: `update-label-keywords.js --label "New Name"` — ID remains stable
- **Clean up stale labels**: `list-labels.js | jq` to find unused ones → `delete-label.js --confirm`
- **Propagate changes**: after deleting a label, `list-members.js` to identify affected members, then `update-member.js --labels` to reassign

---

### API Integration Setup (Make / Zapier / n8n)

An agent guiding a user through a no-code automation setup can:

1. **Check plan eligibility** — `get-user-plan.js` (must be Pro or Agency)
2. **Check WhatsApp is live** — `get-connection-status.js` (`isConnected: true` required before sending)
3. **Retrieve the API key** — `get-api-key.js --pretty` — key is printed clearly for the user to copy
4. **Provide the correct endpoint** — `POST /api:hFrjh8a1/send_template_message_by_api` with fields `phone_number`, `template`, `__self`
5. **Confirm the right module** — remind the user to use "Notifyer Systems" in Make/Zapier, not "WhatsAble"

This removes friction from the most common integration support question entirely.

---

### Pre-flight Checks Before Sending Messages

Before any automation sends a WhatsApp message, an agent can gate the action with:

```bash
# 1. Is the WhatsApp number connected and ready?
node scripts/get-connection-status.js
# → check: isConnected === true

# 2. Is the subscription active and within usage limits?
node scripts/get-user-plan.js
# → check: status ∈ ["active","trialing"] AND usages < unique_number_limit

# 3. Is the plan tier capable of API sending?
node scripts/list-plans.js --tier pro   # compare stripe_price_id
```

This prevents failed sends and proactively surfaces issues (stale connection, expired subscription, contact limit reached) before the user notices.

---

### Health Check / Monitoring Script

An agent can run a periodic workspace health check:

```bash
node scripts/get-me.js              # confirm token is valid
node scripts/get-connection-status.js --pretty   # WhatsApp status
node scripts/get-user-plan.js --pretty           # subscription + usage
node scripts/list-members.js --pretty            # team structure
node scripts/list-labels.js --pretty             # label inventory
```

All output is structured JSON, making it trivial to pipe into monitoring tools, alert on anomalies, or log to a dashboard.

---

### Scripted Workspace Cloning

When onboarding multiple clients on a white-label setup, an agent can replicate a workspace template:

1. **Export the source workspace's labels** — `list-labels.js | jq '.data.labels'`
2. **Export the source team structure** — `list-members.js | jq '.data.items'`
3. **Create the new workspace** — `create-account.js`
4. **Recreate labels** — loop `create-label.js` for each label + keyword set
5. **Recreate team members** — loop `invite-member.js` + `update-member.js`

---

## Limitations

The following constraints exist in the current Notifyer API surface and cannot be worked around programmatically:

### Plan & Billing

| Limitation | Details |
|-----------|---------|
| **No programmatic subscription creation** | Stripe checkout requires a browser redirect. Agents cannot subscribe, upgrade, or downgrade a plan on behalf of a user. Direct users to [console.notifyer-systems.com/pricing-plans](https://console.notifyer-systems.com/pricing-plans). |
| **API key requires Pro or Agency plan** | Basic (Bulk Message) accounts cannot use the Developer API or Make/Zapier/n8n. |
| **No API key rotation** | The Developer API key is fixed per workspace. There is no rotate/regenerate endpoint. |

### WhatsApp Connection

| Limitation | Details |
|-----------|---------|
| **Embedded Signup is browser-only** | Connecting a WhatsApp Business number requires the Meta OAuth flow in a browser. An agent can check and refresh connection status, but cannot perform the initial connection. |
| **Meta daily rate limit on refresh** | `refresh-connection.js` re-triggers Meta's registration process. Meta limits this per day. If the daily limit is hit, wait 24 hours. |
| **1:1 number model** | Each Notifyer account (non-Agency) is connected to exactly one WhatsApp Business number. |

### Team & Members

| Limitation | Details |
|-----------|---------|
| **Super Admin is immutable** | The account owner (Super Admin) cannot be modified, demoted, or deleted by any script. |
| **Email is immutable after creation** | A team member's email address cannot be changed. |
| **No email invitation flow** | `invite-member.js` creates the account immediately with a password. There is no "pending invite" state. Share credentials with new members out-of-band. |
| **Member list paginates at 200** | `update-member.js` and `remove-member.js` fetch up to 200 members for pre-flight verification. Workspaces with more than 200 members require manual ID lookup. |

### Labels

| Limitation | Details |
|-----------|---------|
| **Label names must be unique** | Creating a label with a duplicate name returns a blocked error. |
| **No GET-by-ID in the web group** | Fetching a specific label by ID is not available. `update-label-keywords.js` and `delete-label.js` fetch the full list first, then filter. |
| **Deleting a label does not cascade** | When a label is deleted, it is NOT automatically removed from team members that had it assigned. Manually update affected members with `update-member.js --labels`. |
| **Keywords are case-sensitive** | Keyword matching in auto-assignment is case-sensitive. |

### Messaging & Phase 2 Features

| Limitation | Details |
|-----------|---------|
| **No template sending in Phase 1** | Sending WhatsApp template messages (`send_template_message_by_api`) is documented in `api-key-reference.md` but does not yet have a dedicated script. Use the Developer API directly or wait for Phase 2. |
| **No chat surface scripts yet** | Sending text/media messages, conversation management, scheduled messages, AI bot assignment, chat handoff, and notes are all Phase 2. |
| **No broadcast scripts yet** | Creating and sending bulk broadcasts is Phase 2. |
| **No template management scripts yet** | Creating, editing, and listing message templates is Phase 2. |
| **No analytics scripts yet** | Message delivery stats and read rates are Phase 2. |
| **No webhook management scripts yet** | Configuring incoming/outgoing webhooks and the developer event endpoint is Phase 2. |

### General

| Limitation | Details |
|-----------|---------|
| **Node.js 18+ required** | Scripts use native `fetch`, top-level await patterns, and ESM modules. Node 16 and below are not supported. |
| **Tokens expire** | JWTs have an expiry. If a script returns HTTP 401, re-run `login.js` to get a fresh token. |
| **No token refresh automation** | There is no token refresh endpoint. When the token expires, a full `login.js` call is required. |

---

## Repository Structure

```
agent-skills-by-notifyer/
├── README.md                          ← You are here
└── skills/
    └── setup-notifyer/                ← Phase 1: workspace configuration
        ├── SKILL.md                   ← Agent entrypoint (loaded by compatible agents)
        ├── package.json
        ├── scripts/
        │   ├── lib/
        │   │   ├── notifyer-api.js    ← HTTP client (auth, JSON, errors)
        │   │   ├── args.js            ← CLI argument parser
        │   │   └── result.js          ← Standardized output helpers
        │   ├── create-account.js
        │   ├── login.js
        │   ├── get-me.js
        │   ├── get-connection-status.js
        │   ├── refresh-connection.js
        │   ├── list-plans.js
        │   ├── get-user-plan.js
        │   ├── list-members.js
        │   ├── invite-member.js
        │   ├── update-member.js
        │   ├── remove-member.js
        │   ├── list-labels.js
        │   ├── create-label.js
        │   ├── update-label-keywords.js
        │   ├── delete-label.js
        │   └── get-api-key.js
        ├── references/
        │   ├── account-reference.md
        │   ├── whatsapp-connection-reference.md
        │   ├── plans-reference.md
        │   ├── team-reference.md
        │   ├── labels-reference.md
        │   └── api-key-reference.md
        └── assets/
            ├── signup-example.json
            ├── connection-status-example.json
            └── user-plan-example.json
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

Skills use **progressive disclosure**: agents load only the skill name and description at startup. The full `SKILL.md` — and any referenced scripts or docs — is loaded only when the agent determines it is relevant to the current task. This keeps context usage efficient.

Compatible agents (partial list from [agentskills.io](https://agentskills.io)): OpenClaw, Cursor, Claude Code, GitHub Copilot, VS Code, Gemini CLI, Amp, Roo Code, Junie, OpenHands, Mux, Goose, Letta, Firebender, Factory, Piebald, TRAE, Spring AI, and more.

---

## Learn More

| Resource | Link |
|----------|------|
| Notifyer Console | [console.notifyer-systems.com](https://console.notifyer-systems.com) |
| Notifyer Chat | [chat.notifyer-systems.com](https://chat.notifyer-systems.com) |
| Notifyer Documentation | [docs.whatsable.app](https://docs.whatsable.app) |
| AgentSkills specification | [agentskills.io/specification](https://agentskills.io/specification) |
| AgentSkills community | [github.com/agentskills/agentskills](https://github.com/agentskills/agentskills) |
| WhatsAble | [notifyer-systems.com](https://notifyer-systems.com) |

---

*Proprietary — © WhatsAble. All rights reserved.*
