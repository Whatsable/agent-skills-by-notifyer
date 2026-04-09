# Labels & Chat Handoff Reference — chat-notifyer

## Labels in Chat

Labels serve two distinct purposes in Notifyer:

1. **Console side** (setup-notifyer): Create label definitions with keywords and routing rules.
2. **Chat side** (chat-notifyer): Assign labels to specific recipient conversations.

Labels assigned to a recipient appear in their `global_label` array (string array of label names).

---

## Label Assignment API

```
PATCH /api:bVXsw_FD/web/recipient/:id
Body: { "global_label": ["Support", "VIP"] }
```

**Authentication:** `Authorization: <token>` (raw JWT)  
**CORS:** `Origin: https://chat.notifyer-systems.com`

**Strategy — always fetch before patch:**
1. `GET /web/recipient?search=<phone>` → find recipient and get `id` and current `global_label`
2. Merge new label into existing array (assign) or filter it out (remove)
3. `PATCH /web/recipient/:id` with complete new `global_label` array

**Do not send partial arrays.** Always send the complete intended final state.

---

## Keyword-Based Auto-Labelling

Notifyer automatically assigns labels based on keywords in incoming messages.

**How it works:**
1. A label is created in setup-notifyer with keyword rules (e.g. "Support" label with keywords: "help", "issue", "problem")
2. When an incoming WhatsApp message contains a keyword, Xano matches it to the label and assigns it to the recipient automatically
3. No action required from agents

**Manual override:**
- `assign-label.js` and `remove-label.js` can override auto-assigned labels at any time.
- Auto-labelling continues to run on future messages.

**Human Label (special label):**
The "Human" label (or configured handoff label) signals that a human agent should handle the conversation. When the AI detects this label (via the AI bot's `handoff_label` config), it stops responding and yields to a human agent.

---

## Label Routing & Role Behaviour

| Role        | Recipients Visible |
|-------------|-------------------|
| Admin       | All recipients (no label restriction) |
| Super Admin | All recipients |
| Team Member | Only recipients whose `global_label` intersects with the member's assigned labels |

**Implication for scripts:** When running as a Team Member token, `list-recipients.js` and `filter-recipients-by-label.js` will only return recipients within the member's label scope. This is a server-side restriction — the script cannot override it.

---

## Chat Handoff

### Handoff Modes

| Mode    | Meaning | `is_ai_assistant` |
|---------|---------|------------------|
| `bot`   | AI bot handles the conversation | `true` |
| `human` | Human agent handles the conversation | `false` |

### Dedicated Handoff Endpoint

```
PATCH /api:bVXsw_FD/chatapp/recipient/handoff
Body: { phone_number: <int>, user_id: "<uuid>", handoff: "human" | "bot" }
```

**Authentication:** `Authorization: <token>` (raw JWT)  
**CORS:** None required  
**Auth badge in Xano:** Public — but Authorization header sent for consistency

**user_id** must be the UUID of the authenticated user, obtained from:
```
GET /api:-4GSCDHb/auth/me → data.user_id
```

### Alternative via PATCH recipient

```
PATCH /api:bVXsw_FD/web/recipient/:id
Body: { "is_ai_assistant": false }
```

This achieves the same toggle but requires knowing the recipient's `id`. The dedicated `/handoff` endpoint is simpler as it uses `phone_number` directly.

---

## AI Bot Assignment

```
PATCH /api:bVXsw_FD/web/recipient/:id
Body: { "ai_bot_id": 5, "is_ai_assistant": true }
```

**Strategy:** Fetch recipient to get `id` → PATCH with new `ai_bot_id` and optionally `is_ai_assistant: true`.

**Bot IDs:** Get from `node scripts/list-bots.js --pretty`

**AI Bot Config Fields:**

| Field          | Description |
|---------------|-------------|
| id            | Bot integer ID — use for assign-bot.js |
| name          | Bot name |
| model         | AI model (e.g. "gpt-4o") |
| temperature   | Response creativity (0.0–1.0) |
| handoff_label | Label name that triggers human handoff |
| status        | true = active |

**Handoff via label:** When the AI assigns the `handoff_label` label to the conversation, Notifyer automatically sets `is_ai_assistant: false` for that recipient, handing off to a human.

---

## Workflow: Full Chat Handoff Pattern

```
1. AI bot is handling a conversation (is_ai_assistant: true)
2. Conversation gets complex → agent wants to take over
3. Run: node scripts/set-handoff.js --phone 14155550123 --mode human
4. is_ai_assistant → false; bot stops responding
5. Human agent handles conversation in chat.notifyer-systems.com
6. Conversation resolved → return to bot:
   node scripts/set-handoff.js --phone 14155550123 --mode bot
7. is_ai_assistant → true; bot resumes
```

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `global_label` not updated | Sent partial update | Always fetch current labels, merge, send full array |
| CORS 401 | Missing Origin header | Scripts auto-add it; check NOTIFYER_CHAT_ORIGIN |
| user_id not found | Token expired | Re-run setup-notifyer/login.js |
| Bot not found | Wrong bot-id | Run list-bots.js to get valid IDs |
