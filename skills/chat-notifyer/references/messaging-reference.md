# Messaging Reference — chat-notifyer

## Overview

Notifyer supports three types of outbound messages from the chat interface:
1. **Text** — Free-text WhatsApp messages (24h window required)
2. **Template** — Pre-approved WhatsApp template messages (no window required)
3. **Attachment** — Media files: image, video, audio, document (24h window required)

All messaging endpoints use **chat auth mode**: `Authorization: <token>` (raw JWT, no `Bearer` prefix).

---

## Send Text Message

```
POST /api:bVXsw_FD/web/send/text
```

**Authentication:** `Authorization: <token>` (raw JWT)  
**CORS:** None required (confirmed: no cors_origin_web_chat step in Xano)

**Request Body:**

| Field          | Type    | Required | Notes |
|---------------|---------|----------|-------|
| text          | text    | yes      | The message content |
| phone_number  | integer | yes      | Without + prefix |
| scheduled_time | integer | no      | Unix ms timestamp. Omit entirely for immediate send. |
| currentRecipient | json | no      | Full recipient object (optional context for Xano) |

**Scheduling:** Xano checks `if input:scheduled_time|is_empty == false`. Omit `scheduled_time` for immediate send. Pass a Unix ms timestamp to schedule.

**24h Window:** REQUIRED. If window is closed, the API will return an error. Use `send-template.js` when window is closed.

**Side effects on success:**
- Logs message to `chat_log` and `conversation` tables
- Updates subscriber usage tracking
- Fires `/send_outgoing_message_by_webhook` if outgoing webhooks configured

---

## Send Template Message

```
POST /api:bVXsw_FD/web/send/template
```

**Authentication:** `Authorization: <token>` (raw JWT)  
**CORS:** `Origin: https://chat.notifyer-systems.com` (runs `/cors_origin_web_chat`)

**Request Body (sent as full JSON — Xano uses Get All Input):**

| Field            | Type    | Required | Notes |
|-----------------|---------|----------|-------|
| template         | text    | yes      | Template ID string (from automate-notifyer/list-templates.js) |
| variables        | json    | yes (can be `{}`) | Variable values for template placeholders |
| current_recipient | json  | yes      | Object with at least `{ phone_number: <integer> }` |
| scheduled_time   | integer | yes      | 0 = immediate, Unix ms = scheduled |

**Variables Object Keys:**

| Key          | Applies To |
|-------------|-----------|
| body1        | Body placeholder {{1}} |
| body2        | Body placeholder {{2}} |
| body3        | Body placeholder {{3}} |
| m_1          | Header media URL (for image/video/document templates) |
| visit_website | Button URL variable |
| button_dynamic_url_value | Alternative button URL key |

**Scheduling:** Xano checks `if $var:payload.scheduled_time != 0`. Always include `scheduled_time`.
- `scheduled_time: 0` → immediate send
- `scheduled_time: <unix_ms>` → scheduled

**24h Window:** NOT required. Templates can be sent at any time to any valid phone number.

**Auto-creates recipient:** If the recipient does not exist in Notifyer yet, Xano calls `/recipient_create` automatically on a successful template send.

**Side effects on success:**
- Logs to `success_messaging_templates`, `conversation`, `log` tables
- Updates `subscriber_packages` (billing/usage)
- Fires `/send_outgoing_message_by_webhook` if webhooks configured

**Response structure:** Xano returns the raw Meta API response (`var:request_hit_into_whatsapp`).

**HTTP 200 with failure:** Xano may return HTTP 200 with `success: false` when the Meta API rejects the template (e.g., wrong variable count, unapproved template). Always check the `success` field.

---

## Send Attachment

```
Step 1: POST /api:ox_LN9zX/upload_file_by_attachment   (multipart/form-data)
Step 2: POST /api:bVXsw_FD/web/send/attachment          (JSON)
```

### Step 1 — Upload File

**Authentication:** `Authorization: <token>` (raw JWT)  
**CORS:** `Origin: https://chat.notifyer-systems.com` (Step 1 requires CORS)

**Form Data:**

| Field | Type | Notes |
|-------|------|-------|
| file  | File | The file to upload |

**Supported types and limits:**

| Type     | Extensions | Max Size |
|---------|------------|----------|
| image   | .jpg, .jpeg, .png, .gif, .webp | 5 MB |
| video   | .mp4 | 16 MB |
| audio   | .aac, .mp3, .ogg, .amr, .opus | 16 MB |
| document | .pdf, .docx, .xlsx, .txt, etc. | 100 MB |

**Upload Response:**
```json
{ "url": "https://cdn.notifyer.com/...", "mime_type": "image/jpeg" }
```

### Step 2 — Send Attachment

**Authentication:** `Authorization: <token>` (raw JWT)  
**CORS:** None required for Step 2

**Request Body:**

| Field            | Type    | Required | Notes |
|-----------------|---------|----------|-------|
| url             | text    | yes      | URL from Step 1 upload |
| mime_type       | text    | yes      | MIME type from Step 1 (e.g. "image/jpeg") |
| phone_number    | integer | yes      | Recipient phone without + |
| caption         | text    | no       | Optional caption for image/video |
| currentRecipient | json   | yes      | `{ phone_number: <int> }` minimum |
| scheduled_time  | integer | yes      | 0 = immediate, Unix ms = scheduled |

**24h Window:** REQUIRED (same as text messages).

---

## Scheduling Messages

All three message types support scheduling. Scheduled messages are stored in Xano's `chat_schedule` table and fired automatically.

| Script          | Schedule param | Xano check |
|----------------|----------------|------------|
| send-text.js   | Omit `scheduled_time` for immediate | `is_empty == false` → schedule |
| send-template.js | `scheduled_time: 0` for immediate | `!= 0` → schedule |
| send-attachment.js | `scheduled_time: 0` for immediate | `!= 0` → schedule |

**Date format for scripts:** `"DD/MM/YYYY HH:mm"` (e.g. `"25/01/2025 14:00"`)

**Managing scheduled messages:**
- List: `node scripts/list-scheduled.js`
- Cancel: `node scripts/delete-scheduled.js --id <id> --confirm`

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| HTTP 401 Unauthorized | CORS origin mismatch or invalid token | Check NOTIFYER_CHAT_ORIGIN, re-login |
| success: false in body | Meta API rejected the template | Check template approval status, variable count |
| 24h window closed | Recipient hasn't messaged in 24h | Use send-template.js |
| Upload fails (413) | File too large | Compress or split the file |
| Template not found | Wrong template_id | Run automate-notifyer/list-templates.js --pretty |
