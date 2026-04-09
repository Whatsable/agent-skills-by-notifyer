# Recipients Reference — chat-notifyer

## Overview

Recipients in Notifyer are WhatsApp contacts who have messaged your connected number. Each recipient has:
- A conversation thread (accessible in chat.notifyer-systems.com)
- A 24-hour messaging window (tracks when the last user message arrived)
- Labels for routing/filtering
- Note fields (manual + AI-generated)
- AI assistant assignment

---

## API Endpoints

### List Recipients

```
GET /api:bVXsw_FD/web/recipient
```

**Authentication:** `Authorization: <token>` (raw JWT, no Bearer)  
**CORS:** `Origin: https://chat.notifyer-systems.com` (runs `/cors_origin_web_chat`)

**Query Parameters:**

| Parameter    | Type    | Required | Notes |
|-------------|---------|----------|-------|
| page_number | integer | yes      | 0-based. Page 1 = `page_number=0` |
| per_page    | integer | yes      | Recommended: 20 |
| search      | string  | yes      | Name or phone substring. Send `search=` if no filter |
| labels      | json[]  | yes      | `labels[]=Support&labels[]=Billing` or `labels=[]` for no filter |
| status      | string  | no       | `unread` for unread-only. Send `status=` if no filter |

**Serialisation note:** Frontend uses custom serializer. Non-empty labels use repeated `labels[]=X` params. Empty labels use literal `labels=[]`. Scripts match this exactly.

**Response:** Array of `{ recipient: {...}, conversation: {...} }` objects.

**Role behaviour:**
- Admin / Super Admin: see all recipients
- Team Member: only see recipients matching their assigned labels (server-side filter)

---

### Get Single Recipient

```
GET /api:bVXsw_FD/chatapp/recipient?phone_number=<int>&user_id=<uuid>
```

**Authentication:** `Authorization: <token>` (raw JWT)  
**CORS:** None required (chatapp endpoints have no cors_origin_web_chat)  
**Auth badge in Xano:** Public — but Authorization header is sent for consistency

**Query Parameters:**

| Parameter   | Type    | Required |
|------------|---------|----------|
| phone_number | integer | yes    |
| user_id    | uuid string | yes  | Get from `GET /api:-4GSCDHb/auth/me` → `user_id` field |

**Response:** Single recipient object (or null if not found).

---

### Update Recipient (PATCH)

```
PATCH /api:bVXsw_FD/web/recipient/:id
```

**Authentication:** `Authorization: <token>` (raw JWT)  
**CORS:** `Origin: https://chat.notifyer-systems.com`

**Path parameter:** `id` — integer recipient ID

**Patchable fields:**

| Field          | Type      | Notes |
|---------------|-----------|-------|
| note          | text      | Manual note — free text |
| global_label  | json (string[]) | Array of label name strings |
| is_ai_assistant | boolean | Whether AI bot is handling the conversation |
| ai_bot_id     | integer   | Which bot is assigned |
| name          | text      | Display name |

**Strategy:** Always fetch first (using GET /web/recipient search), then patch with merged state. Do not send partial arrays — always send the complete intended state.

---

## Recipient Object Fields

| Field                    | Type     | Description |
|-------------------------|----------|-------------|
| id                      | integer  | Internal Notifyer record ID |
| created_at              | integer  | Unix ms timestamp |
| user_id                 | uuid     | Account owner's user_id |
| name                    | text     | Display name (from WhatsApp profile) |
| phone_number            | integer  | Phone number without + |
| phone_number_string     | text     | Formatted phone e.g. "+14155550123" |
| country                 | text     | Country code |
| global_label            | string[] | Assigned label names (JSON array) |
| note                    | text     | Manual note |
| note_auto               | text     | AI-generated note (read-only via API) |
| is_ai_assistant         | boolean  | true = AI bot handling, false = human |
| ai_bot_id               | integer  | Assigned AI bot ID (null = none) |
| expiration_timestamp    | integer  | Unix ms when 24h window expires (null = closed) |
| last_message_time       | integer  | Last outgoing message time |
| recipient_last_message_time | integer | Last incoming message time |

---

## 24-Hour Messaging Window

WhatsApp's policy: you can only send **free-text messages** within 24 hours of the recipient's last inbound message.

```
Window open:   expiration_timestamp != null && expiration_timestamp > Date.now()
Window closed: expiration_timestamp == null || expiration_timestamp < Date.now()
```

| Window State | Can Send            |
|-------------|---------------------|
| Open        | Text, Template, Attachment |
| Closed      | Template only (send-template.js) |

**Check window:** `node scripts/get-recipient.js --phone <number> --pretty`

---

## Label System

Labels in Notifyer serve two purposes:

1. **Routing**: Team Members are assigned labels in setup-notifyer. They only see recipients matching their labels.
2. **Filtering**: Admins can filter the recipient list by label to find contacts in a specific segment.

Labels are stored as `global_label` (JSON string array) on each recipient.

### Keyword-based Auto-labelling

Each label in setup-notifyer has keyword rules. When an incoming message matches a keyword, Notifyer automatically assigns that label to the recipient. This happens server-side — no script action needed.

### Manual labelling

Use `assign-label.js` and `remove-label.js` to manually add/remove labels.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| HTTP 401 Unauthorized | CORS check failed | Verify NOTIFYER_CHAT_ORIGIN env var |
| HTTP 401 | Invalid token | Re-run setup-notifyer/login.js |
| Recipient not found | Wrong phone format or no conversation yet | Use integer format (no +) |
| Empty global_label after patch | Sent `[]` correctly but Xano stored differently | Check response; labels should be empty array |
