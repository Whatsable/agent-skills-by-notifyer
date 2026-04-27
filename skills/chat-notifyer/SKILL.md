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
compatibility: Requires Node.js >= 18. Set NOTIFYER_API_BASE_URL and NOTIFYER_API_TOKEN before running any script.
metadata:
  author: whatsable
  version: "0.3.0"
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
Optional: set `NOTIFYER_CHAT_ORIGIN` if you need a different Origin header.

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

**WhatsApp policy:** Free-text messages and attachments can only be sent within 24 hours of the recipient's last inbound message.

```
Window open:   recipient.expiration_timestamp > Date.now()
Window closed: recipient.expiration_timestamp == null OR < Date.now()
```

| Window State | Allowed Messages |
|-------------|-----------------|
| Open | Text ✓, Template ✓, Attachment ✓ |
| Closed | Template only ✓ |

**Before sending text or attachments, verify the 24-hour window:**
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

Label matching is case-sensitive. If the API returns 0 results, the script automatically retries with case-insensitive client-side filtering and flags `used_case_insensitive_fallback: true` in the output.

### Fetch all recipients across all pages

```bash
node scripts/list-recipients.js --all --pretty
```

### Send a text message

```bash
node scripts/send-text.js --phone 14155550123 --text "Hello! How can I help?"
```

`send-text.js` automatically checks the 24h messaging window before sending. If the window is closed it exits with `ok: false` and a clear message explaining the options (use a template, or wait for the contact to message first). No manual pre-check with `get-recipient.js` is needed.

### Send a template message (works any time)

```bash
# By template name (recommended — easier than looking up the ID):
node scripts/send-template.js --phone 14155550123 --name order_confirm
node scripts/send-template.js --phone 14155550123 --name order_confirm \
  --variables '{"body1":"John","body2":"#12345"}'

# List all available templates:
node scripts/send-template.js --list

# Preview what would be sent without actually sending:
node scripts/send-template.js --phone 14155550123 --name order_confirm --dry-run

# By template ID (legacy):
node scripts/send-template.js --phone 14155550123 --template tmpl_abc123
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

### Read the full conversation thread (sent + received)

```bash
# Last 30 messages (both sides of the conversation):
node scripts/get-conversation.js --phone 14155550123 --pretty

# Page through history:
node scripts/get-conversation.js --phone 14155550123 --page 1 --per-page 50 --pretty
```

### Read outbound send history (analytics/delivery log)

```bash
# Last 20 outbound-only messages with delivery status:
node scripts/get-conversation-log.js --phone 14155550123 --pretty

# All messages ever sent to this contact:
node scripts/get-conversation-log.js --phone 14155550123 --all --pretty
```

**Note:** `get-conversation.js` returns the full bidirectional thread (both sides). `get-conversation-log.js` returns outbound-only sends with delivery analytics (from the console log API).

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

## Feedback

If you encounter an error, find something unclear, want to request a feature, or
spot a security concern while using this skill, send feedback to the Notifyer team:

```bash
node ../setup-notifyer/scripts/send-feedback.js \
  --feedback "your message here" \
  --type error|request|unclear|security|improvement|general \
  --skill chat-notifyer \
  --script <script-name.js>
```

Requires `NOTIFYER_API_TOKEN` (same token used by all scripts).

---

## Rules for AI Agents

1. **Auth mode**: Use raw JWT (`Authorization: <token>`, no `Bearer` prefix) for all chat endpoints in this skill, except `list-bots.js`, which uses console auth.

2. **Phone numbers**: Send phone numbers as integers (no `+` prefix). Parse with `parseInt(phone.replace(/^\+/, ""), 10)`.

3. **24h window**: `send-text.js` auto-checks the window and refuses to send if it is closed — no pre-check needed. For attachments, check `expiration_timestamp` via `get-recipient.js`. If window closed, use `send-template.js`.

4. **Fetch before patch**: For label changes, note changes, and bot assignment — fetch the recipient first to get current state, then PATCH with the full intended state.

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
| `scripts/send-text.js` | Send a free-text message (auto-checks 24h window; refuses if closed) | Chat |
| `scripts/send-template.js` | Send a template message (no window required; supports `--name`, `--list`, `--dry-run`) | Chat |
| `scripts/send-attachment.js` | Upload file then send as image/video/audio/document (auto-detects type) | Chat |
| `scripts/assign-label.js` | Assign a label to a recipient | Chat |
| `scripts/remove-label.js` | Remove a label from a recipient | Chat |
| `scripts/set-handoff.js` | Toggle AI bot vs. human mode | Chat |
| `scripts/assign-bot.js` | Assign specific AI bot to recipient | Chat |
| `scripts/list-bots.js` | List all AI bots (for bot ID lookup) | Console |
| `scripts/list-scheduled.js` | List all scheduled messages | Chat |
| `scripts/delete-scheduled.js` | Cancel a scheduled message | Chat |
| `scripts/add-note.js` | Set or append to manual note on recipient | Chat |
| `scripts/get-notes.js` | Read manual + AI-generated notes for recipient | Chat |
| `scripts/get-conversation.js` | Read full bidirectional chat thread (sent + received messages) | Chat |
| `scripts/get-conversation-log.js` | Read outbound-only send history with delivery status (console log API) | Console |
| `scripts/update-recipient.js` | Update recipient display name | Chat |

### Shared Library (scripts/lib/)

| File | Description |
|------|-------------|
| `lib/notifyer-api.js` | `loadConfig`, `requestJson`, `AUTH_MODE_CHAT`, `AUTH_MODE_CONSOLE` |
| `lib/args.js` | `parseArgs`, `getFlag`, `getBooleanFlag`, `getNumberFlag` |
| `lib/result.js` | `ok`, `err`, `printJson` — standardised JSON output |
| `lib/schedule-response.js` | `validateScheduledSendResponse` — detects silent schedule failures (`status: not_passed`, `id: null`) |

---

## References

| File | Coverage |
|------|----------|
| `../../AUTHENTICATION.md` | **All three auth surfaces** — curl examples, decision guide, header formats, error diagnostics |
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
- **`get-conversation.js` reads the full thread; `get-conversation-log.js` is outbound-only.** Use `get-conversation.js` (Chat API, `/web/conversations`) to read both sides of a conversation. Use `get-conversation-log.js` (Console API, `/api:ereqLKj6/log`) for outbound delivery analytics only.
- **No incoming message handling in scripts.** Incoming messages trigger webhooks (see `automate-notifyer` skill). Scripts cannot subscribe to or poll for new inbound messages.
- **24h window is enforced by WhatsApp server-side.** Scripts cannot bypass it. When the window is closed, use `send-template.js` — free-text sends will be rejected by Meta.
- **note_auto is read-only.** AI-generated notes are written by Notifyer's internal AI logic and cannot be set or cleared via API.
- **No bulk send from chat.** For bulk messaging to multiple recipients at once, use `automate-notifyer/create-broadcast.js`.
- **Template approval required before use.** Templates must have `APPROVED` status from Meta. Manage template creation and status via `automate-notifyer/create-template.js` and `list-templates.js`.
- **Team Member token restricts recipient visibility.** Xano server-side filters recipients to the member's assigned label scope. This cannot be overridden from the script.
- **set-handoff.js and get-recipient.js call `/auth/me` internally.** This adds one extra API round-trip on each invocation. If the token is expired, both the auth/me call and the main call will fail — re-run `setup-notifyer/login.js` to refresh.
- **Mark-as-read has no script.** `PATCH /api:bVXsw_FD/web/conversations` (`{ phone_number, message_id, status }`) updates message read/delivery status. This is triggered automatically by the chat UI when a conversation is opened — there is no script for it, and AI agents do not need to call it manually.
- **Recipient CSV download is not covered.** `GET /api:bVXsw_FD/recipient_download_csv` returns a binary CSV stream. Use raw `fetch` with `response.text()` or `response.blob()` in a custom workflow if you need to export the full recipient list.
