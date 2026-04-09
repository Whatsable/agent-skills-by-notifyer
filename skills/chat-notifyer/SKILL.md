---
name: chat-notifyer
description: >
  Live chat operations for Notifyer by WhatsAble. Enables AI agents to operate
  the WhatsApp chat interface: list and search conversations, send text/template/
  attachment messages, assign labels, control AI bot vs. human handoff, schedule
  messages, and manage recipient notes. Use this skill when you need to interact
  with active WhatsApp conversations, manage recipients, send messages, handle
  chat handoff between AI bots and humans, schedule messages, or manage notes.
  Requires setup-notifyer to be configured first (NOTIFYER_API_TOKEN from login.js).
license: Proprietary — © WhatsAble. All rights reserved.
compatibility: Requires Node.js >= 18. Set NOTIFYER_API_BASE_URL and NOTIFYER_API_TOKEN before running any script. Optionally set NOTIFYER_CHAT_ORIGIN (default: https://chat.notifyer-systems.com).
metadata:
  author: whatsable
  version: "0.1.0"
  product: Notifyer by WhatsAble
  api-base: https://api.insightssystem.com
  depends-on: setup-notifyer
---

# chat-notifyer

Live chat operations for the Notifyer platform (chat.notifyer-systems.com).

This skill covers **Phase 3** of the Notifyer agent-skills suite:

| Phase | Skill | Coverage |
|-------|-------|----------|
| 1 | setup-notifyer | Account, WhatsApp connection, Plans, Team, Labels, API Key |
| 2 | automate-notifyer | Templates, AI Bots, Broadcasts, Analytics, Webhooks |
| **3** | **chat-notifyer** | **Recipients, Messaging, Labels, Handoff, Scheduling, Notes** |

---

## Environment Variables

Set these before running any script:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOTIFYER_API_BASE_URL` | **yes** | — | Backend API base URL (e.g. `https://api.insightssystem.com`) |
| `NOTIFYER_API_TOKEN` | **yes** | — | JWT token from `setup-notifyer/login.js` |
| `NOTIFYER_CHAT_ORIGIN` | no | `https://chat.notifyer-systems.com` | CORS Origin header for chat endpoints |

```bash
export NOTIFYER_API_BASE_URL="https://api.insightssystem.com"
export NOTIFYER_API_TOKEN="eyJhbGciOi..."     # from setup-notifyer/login.js
```

---

## Authentication

This skill uses **Chat Auth Mode**: `Authorization: <token>` (raw JWT, NO `Bearer` prefix).

This is different from `setup-notifyer` and `automate-notifyer` which use `Authorization: Bearer <token>`.

**The same JWT token works for both modes** — only the header format differs.

The token is obtained from `setup-notifyer/scripts/login.js` and stored as `NOTIFYER_API_TOKEN`.

---

## CORS

Several endpoints run Xano's `/cors_origin_web_chat` function which allows requests from:
- `https://chat.notifyer-systems.com` (primary)
- `https://console.notifyer-systems.com`
- `https://api.insightssystem.com`
- `https://preview-chat-notifyer.vercel.app`
- `http://localhost:5173`, `http://localhost:3000`, `http://127.0.0.1:5173`

Scripts automatically send `Origin: https://chat.notifyer-systems.com`.  
Override with `NOTIFYER_CHAT_ORIGIN` env var.

Endpoints that do NOT require CORS: `/chatapp/*` endpoints, `send/text`.

---

## API Group IDs

| Group | Path Prefix | Covers |
|-------|-------------|--------|
| Auth | `/api:-4GSCDHb` | `/auth/me` — resolves user_id for chatapp endpoints |
| Chat Web | `/api:bVXsw_FD` | Recipients, messaging, schedules (primary group for this skill) |
| Media Upload | `/api:ox_LN9zX` | File upload for attachments |
| AI Config | `/api:Sc_sezER` | List bots (console auth) |

---

## 24-Hour Window Rule

**Critical WhatsApp policy:** Free-text messages and attachments can only be sent within 24 hours of the recipient's last inbound message.

```
Window open:   recipient.expiration_timestamp > Date.now()
Window closed: recipient.expiration_timestamp == null OR < Date.now()
```

| Window State | Allowed Messages |
|-------------|-----------------|
| Open | Text ✓, Template ✓, Attachment ✓ |
| Closed | Template only ✓ |

**Always check before sending text/attachments:**
```bash
node scripts/get-recipient.js --phone 14155550123 --pretty
```

---

## How-to Guide

### List all active conversations

```bash
node scripts/list-recipients.js --pretty
```

### Search for a specific contact

```bash
node scripts/list-recipients.js --search "John" --pretty
node scripts/list-recipients.js --search "14155550123" --pretty
```

### Get full recipient details (with 24h window check)

```bash
node scripts/get-recipient.js --phone 14155550123 --pretty
```

### List unread conversations with a specific label

```bash
node scripts/filter-recipients-by-label.js --labels "Support" --status unread --pretty
```

### Fetch all recipients across all pages

```bash
node scripts/list-recipients.js --all --pretty
```

### Send a text message

```bash
node scripts/send-text.js --phone 14155550123 --text "Hello! How can I help?"
```

**Note:** Only works when the 24h window is open.

### Send a template message (works any time)

```bash
# First, get your template IDs:
node ../automate-notifyer/scripts/list-templates.js --pretty

# Send with variables:
node scripts/send-template.js \
  --phone 14155550123 \
  --template tmpl_abc123 \
  --variables '{"body1":"John","body2":"#12345"}'
```

### Send a file (image, PDF, video, audio)

```bash
node scripts/send-attachment.js --phone 14155550123 --file /path/to/invoice.pdf --pretty
node scripts/send-attachment.js --phone 14155550123 --file /path/to/photo.jpg --caption "Your order photo"
```

### Schedule a message for later

```bash
node scripts/send-text.js \
  --phone 14155550123 \
  --text "Your appointment is tomorrow at 10am!" \
  --schedule "25/01/2025 09:00"

node scripts/send-template.js \
  --phone 14155550123 \
  --template tmpl_abc123 \
  --schedule "25/01/2025 14:00"
```

### View all scheduled messages

```bash
node scripts/list-scheduled.js --pretty
node scripts/list-scheduled.js --phone 14155550123
```

### Cancel a scheduled message

```bash
node scripts/delete-scheduled.js --id 7 --confirm
```

### Assign a label to a conversation

```bash
node scripts/assign-label.js --phone 14155550123 --label "Support" --pretty
```

Labels must exist — create them first via `setup-notifyer/create-label.js`.

### Remove a label from a conversation

```bash
node scripts/remove-label.js --phone 14155550123 --label "Support" --pretty
```

### Filter conversations by label

```bash
node scripts/filter-recipients-by-label.js --labels "VIP,Support" --pretty
```

### Take over a conversation from the AI bot (human handoff)

```bash
node scripts/set-handoff.js --phone 14155550123 --mode human --pretty
```

### Return a conversation to the AI bot

```bash
node scripts/set-handoff.js --phone 14155550123 --mode bot --pretty
```

### Assign a specific AI bot to a conversation

```bash
# Step 1: list available bots
node scripts/list-bots.js --pretty

# Step 2: assign bot and enable AI mode
node scripts/assign-bot.js --phone 14155550123 --bot-id 5 --pretty
```

### Read conversation message history

```bash
# Last 20 outbound messages to this contact:
node scripts/get-conversation-log.js --phone 14155550123 --pretty

# All messages ever sent to this contact:
node scripts/get-conversation-log.js --phone 14155550123 --all --pretty
```

**Note:** Only outbound messages (sent by Notifyer) are in this log. Inbound messages from the customer are not captured — view those in chat.notifyer-systems.com.

### Update a recipient's display name

```bash
node scripts/update-recipient.js --phone 14155550123 --name "John Doe" --pretty
```

### Read notes for a recipient

```bash
node scripts/get-notes.js --phone 14155550123 --pretty
```

### Add or update a manual note

```bash
node scripts/add-note.js --phone 14155550123 --note "VIP customer — apply 15% discount"
node scripts/add-note.js --phone 14155550123 --append "Requested callback on 15 Feb"
node scripts/add-note.js --phone 14155550123 --note ""   # clear note
```

---

## Rules for AI Agents

1. **Auth mode**: Always use raw JWT (`Authorization: <token>`, no `Bearer` prefix) for all chat endpoints in this skill, EXCEPT `list-bots.js` which uses console auth.

2. **Phone numbers**: Always send as integer (no `+` prefix). Parse with `parseInt(phone.replace(/^\+/, ""), 10)`.

3. **24h window**: Check `expiration_timestamp` before sending text or attachment. If window closed, use template only.

4. **Fetch before patch**: For label changes, note changes, and bot assignment — always fetch the recipient first to get current state, then PATCH with the full intended state.

5. **Labels are strings**: `global_label` is a `string[]` of label **names** (not IDs). Send `["Support", "Billing"]` — not `[1, 2]`.

6. **CORS endpoints**: All `/web/*` endpoints require `Origin: https://chat.notifyer-systems.com`. Scripts handle this automatically.

7. **user_id for chatapp endpoints**: `get-recipient.js` and `set-handoff.js` call `/auth/me` internally to resolve the user_id UUID. No manual action needed.

8. **Page numbering**: Xano uses 0-based page numbers internally. Scripts expose 1-based page numbers to users (`--page 1` = `page_number=0` in API).

9. **Template scheduling**: `scheduled_time: 0` = immediate send. `0` is NOT a null/empty — it is the explicit "immediate" signal.

10. **list-bots.js uses console auth**: This is intentional — the AI config endpoint is in the console API group. Both Bearer and raw token use the same JWT, just different formats.

---

## Scripts (FILE MAP)

| Script | Description | Auth Mode |
|--------|-------------|-----------|
| `scripts/list-recipients.js` | List/search conversation recipients with pagination | Chat |
| `scripts/get-recipient.js` | Get single recipient by phone number | Chat |
| `scripts/filter-recipients-by-label.js` | List recipients filtered by label(s) | Chat |
| `scripts/send-text.js` | Send a free-text message (24h window required) | Chat |
| `scripts/send-template.js` | Send a template message (no window required) | Chat |
| `scripts/send-attachment.js` | Upload file then send as media message | Chat |
| `scripts/assign-label.js` | Assign a label to a recipient | Chat |
| `scripts/remove-label.js` | Remove a label from a recipient | Chat |
| `scripts/set-handoff.js` | Toggle AI bot vs. human mode | Chat |
| `scripts/assign-bot.js` | Assign specific AI bot to recipient | Chat |
| `scripts/list-bots.js` | List all AI bots (for bot ID lookup) | Console |
| `scripts/list-scheduled.js` | List all scheduled messages | Chat |
| `scripts/delete-scheduled.js` | Cancel a scheduled message | Chat |
| `scripts/add-note.js` | Set or append to manual note on recipient | Chat |
| `scripts/get-notes.js` | Read manual + AI-generated notes for recipient | Chat |
| `scripts/get-conversation-log.js` | Read outbound message history for a phone number | Console |
| `scripts/update-recipient.js` | Update recipient display name | Chat |

### Shared Library (scripts/lib/)

| File | Description |
|------|-------------|
| `lib/notifyer-api.js` | `loadConfig`, `requestJson`, `AUTH_MODE_CHAT`, `AUTH_MODE_CONSOLE` |
| `lib/args.js` | `parseArgs`, `getFlag`, `getBooleanFlag`, `getNumberFlag` |
| `lib/result.js` | `ok`, `err`, `printJson` — standardised JSON output |

---

## References

| File | Coverage |
|------|----------|
| `references/recipients-reference.md` | Recipient object, GET/PATCH endpoints, 24h window, label routing |
| `references/messaging-reference.md` | Text, template, attachment send APIs — all parameters and side effects |
| `references/labels-handoff-reference.md` | Label assignment, keyword auto-labelling, handoff modes, bot assignment |
| `references/scheduling-notes-reference.md` | Scheduled messages, chat_schedule table, note fields |

---

## Assets

| File | Description |
|------|-------------|
| `assets/send-template-example.json` | Example --variables payloads for common template patterns |

---

## Limitations

- **WhatsApp connection must exist before any messaging.** If the WhatsApp number is disconnected, all send scripts will fail. Check with `setup-notifyer/get-connection-status.js`. Re-connecting a fully revoked WABA requires the browser-based embedded signup — it cannot be scripted.
- **Outbound-only message history.** `get-conversation-log.js` shows messages sent by Notifyer. Inbound messages from customers are not available via API — view them in chat.notifyer-systems.com.
- **No incoming message handling.** Scripts are outbound-only. Incoming messages trigger webhooks (see `automate-notifyer` skill).
- **24h window is enforced by WhatsApp server-side.** Scripts cannot bypass it. When the window is closed, use `send-template.js` — free-text sends will be rejected by Meta.
- **note_auto is read-only.** AI-generated notes are written by Notifyer's internal AI logic and cannot be set or cleared via API.
- **No bulk send from chat.** For bulk messaging to multiple recipients at once, use `automate-notifyer/create-broadcast.js`.
- **Template approval required before use.** Templates must have `APPROVED` status from Meta. Manage template creation and status via `automate-notifyer/create-template.js` and `list-templates.js`.
- **Team Member token restricts recipient visibility.** Xano server-side filters recipients to the member's assigned label scope. This cannot be overridden from the script.
- **set-handoff.js and get-recipient.js call `/auth/me` internally.** This adds one extra API round-trip on each invocation. If the token is expired, both the auth/me call and the main call will fail — re-run `setup-notifyer/login.js` to refresh.
