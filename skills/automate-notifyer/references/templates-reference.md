# Templates Reference

WhatsApp message templates are pre-approved message formats required for the first outbound
message to a contact (outside the 24-hour customer-service window). All templates are
reviewed by Meta before they can be used.

**API Group:** `/api:AFRA_QCy`
**Auth:** `Authorization: Bearer <jwt>` (console auth — `NOTIFYER_API_TOKEN`)

---

## Template data model

```typescript
interface Template {
  id: string;                   // Notifyer internal record ID
  name: string;                 // template name (snake_case, e.g. "order_confirmation")
  template_id: string;          // Notifyer's internal template_id string
  whatsapp_template_id: number; // Meta's numeric WhatsApp template ID (used for deletion)
  category: string;             // "MARKETING" | "UTILITY" | "AUTHENTICATION"
  type: string;                 // "text" | "image" | "document" | "video"
  body: string;                 // Message body text
  language: string;             // IETF language code, e.g. "en", "es", "fr"
  status: string;               // "approved" | "pending" | "rejected"
  components: object[];         // Raw WhatsApp template components (from Meta API)
}
```

The `components` array contains the full WhatsApp template definition including:
- `HEADER` — media type and example URL (for image/video/document templates)
- `BODY` — body text and `example.body_text` (per-variable examples)
- `FOOTER` — optional footer text (AUTHENTICATION security recommendation)
- `BUTTONS` — interactive button definitions

---

## Endpoints

### List all templates — Console (recommended)

**GET `/api:AFRA_QCy/templates_web`**

Returns all templates for the workspace.

**Auth:** `Authorization: Bearer <jwt>` (console auth — `NOTIFYER_API_TOKEN`)

**Xano function stack:**
1. `cors_origin_console` — sets CORS headers
2. `/get_user` — resolves user from Bearer token
3. `Query All Records From template_request` → `var:templates`
4. **For Each Loop on `var:templates`**: if `template.status == PENDING`:
   - Fetches `embedded_users` to get WhatsApp credentials
   - Calls Meta API to get current template status
   - Saves updated `template_status` and `category` back to `template_request`
5. `Query All Records From template_request` → final `var:templates`

**Response:** `Template[]` (direct array, returned `As Self`)

**Important side-effect:** Every call auto-syncs all PENDING templates with Meta.
The returned statuses are always current — no need to poll separately.

**Script:**
```bash
node scripts/list-templates.js
node scripts/list-templates.js --status approved
node scripts/list-templates.js --category MARKETING
node scripts/list-templates.js --pretty
```

---

### List templates — Developer API variant

**GET `/api:AFRA_QCy/get_templates`** (Auth Required — uses raw api_key)

Same sync behavior as `templates_web`, but authenticates via:
1. Lambda → extracts `api_key` from `Authorization` header
2. `Get Record From api_key` → user
3. `/get_user` Synchronous → user

Not wrapped in a script. Use `list-templates.js` for all management tasks.

---

### List templates — Public variant (api_key, no sync)

**GET `/api:AFRA_QCy/templates`** (Public Endpoint — uses raw api_key)

Simpler variant:
1. Lambda → extracts `api_key`
2. `Get Record From api_key` → user
3. `Query All Records From template_request` → templates

Does **not** sync PENDING templates. Returns `{ templates: [...] }` (keyed response).
Not wrapped in a script.

---

### List broadcast-ready templates (approved only)

**GET `/api:AFRA_QCy/templates_broadcast_web`**

Returns only `approved` templates — the subset usable for broadcasts and test sends.
Used by the Broadcasts page and TestMessageSender component.

**Auth:** Bearer console token

**Response:** `Template[]` (same shape, pre-filtered to approved status)

> Not wrapped in a script — `list-templates.js --status approved` achieves the same result.

---

### Get template by name / ID

There is no dedicated GET-by-ID endpoint. Use `list-templates.js` and filter:

**Script:**
```bash
node scripts/get-template.js --name order_confirmation
node scripts/get-template.js --id tmpl_abc123
node scripts/get-template.js --whatsapp-id 123456789
```

---

### Create a template

**POST `/api:AFRA_QCy/create`**

Submits a new template for Meta review. Approval typically takes under 60 seconds.

**Auth:** `Authorization: Bearer <jwt>` (console auth — `NOTIFYER_API_TOKEN`)

**Xano function stack:**
1. `/get_user` — resolves user from Bearer token
2. `Query All Records From template_request` → `var:templates` (checks for duplicate name)
3. Conditional: if `input.category != AUTHENTICATION` → Lambda `creating_template_payload`; else different Lambda
4. Lambda → `variable_counts`
5. Lambda → `formated_template_name`
6. **Precondition: `var:templates == false`** — fails (HTTP 400) if a template with the same name already exists
7. Generate UUID → `template_id`
8. `Get Record From embedded_users` → `get_credentials` (WhatsApp phone credentials)
9. Lambda → `buttons` (builds Meta API button objects)
10. Lambda → `request_hit_into_whatsapp` (**calls Meta API** to create the template)
11. `Get Record From user`
12. Lambda → `template_creation_report`
13. `API Request To https://hook.eu1.make.com/...` → Make webhook notification
14. `Add Record In template_creation_logs`
15. Lambda → `is_response_data_okay_for_store`
16. Conditional: if `is_response_data_okay_for_store == true` → `Add Or Edit Record In template_request`

**Request body:**

```typescript
interface CreateTemplatePayload {
  name: string;                  // snake_case, lowercase, no leading digit, max 512 chars
  category: string;              // "MARKETING" | "UTILITY" | "AUTHENTICATION"
  language: string;              // e.g. "en"
  templateType: string;          // "text" | "image" | "document" | "video"
  mediaUrl: string;              // media handle from upload (for non-text; empty string for text)
  temBody: string;               // body text (use {{1}}, {{2}} for variable placeholders)
  mediaUrlVariableValues: string; // variable for dynamic media URL; usually ""
  bodyVariables: number[];       // sorted array of variable indices, e.g. [1, 2, 3]
  variableValues: { [index: number]: string }; // example values for Meta review
  buttons: PreparedButton[];     // button objects (see Button shapes below)

  // AUTHENTICATION only:
  addSecurityRecommendation?: boolean; // adds "For your security, do not share this code." footer
  codeExpirationMinutes?: number;      // code validity in minutes (default: 10)
  otpButtonText?: string;              // CTA button label (default: "Copy Code")

  // Optional fields (accepted but not required):
  allow_category_change?: boolean; // Meta's allow_category_change flag (default: omitted)
  description?: string;            // internal description (not sent to Meta)
}
```

**Response:** `var:request_hit_into_whatsapp` (the raw Meta API response)

The response is whatever WhatsApp's Business API returned for the template creation
request — NOT an internal Notifyer record. Typical successful response:
```json
{
  "id": "123456789",
  "status": "PENDING",
  "category": "MARKETING"
}
```
The template is saved to Notifyer's `template_request` table only if Meta accepted it
(`is_response_data_okay_for_store == true`). If Meta rejects the payload, the template
will NOT appear in `list-templates.js` output.

**Duplicate name error:**
- If a template with the same name already exists, Xano's Precondition at step 6 fires
- HTTP 400, message: "Precondition Failed"
- `create-template.js` surfaces this as: `{ ok: false, error: "A template named '...' already exists.", blocked: true }`

**Script:**
```bash
# Simple text template
node scripts/create-template.js \
  --name order_confirmation \
  --category MARKETING \
  --body "Hello {{1}}, your order #{{2}} is confirmed." \
  --variables '{"1":"John","2":"12345"}'

# With image attachment (auto-uploads media)
node scripts/create-template.js \
  --name promo_banner \
  --category MARKETING \
  --body "Check out our sale!" \
  --type image \
  --media-url "https://example.com/banner.jpg"

# AUTHENTICATION (body auto-generated by Xano)
node scripts/create-template.js \
  --name verify_otp \
  --category AUTHENTICATION \
  --expiry 10
```

After submission, call `list-templates.js` (which auto-syncs PENDING statuses) to check
when `status` changes from `"PENDING"` to `"approved"` or `"rejected"`.

---

### Manual create (embedded signup use only)

**POST `/api:AFRA_QCy/manual_create`** (Public Endpoint)

Low-level endpoint used during the embedded signup flow. Requires a raw Meta
`access_token` and `whatsapp_id`. Not for general use — managed by the console UI.

**Inputs:**
| Field | Type | Description |
|-------|------|-------------|
| `access_token` | text | Meta user access token |
| `whatsapp_id` | integer | WhatsApp Business phone number ID |
| `requested_template` | json | The Meta template creation payload |
| `user_id` | text | Notifyer user ID |
| `template_id` | text | Template ID string |

**Response:** `var:request_hit` (Meta API response). Template is stored if `request_hit.status == PENDING`.

---

### Media pre-upload

Before creating a non-text template, the media file must be pre-uploaded to get a
**handle** string that is passed as `mediaUrl` in the create payload.

**GET `/api:ox_LN9zX/get_file_base46_encode?attachment=<url>`**

**Auth:** Bearer console token

**Input:** Public URL of the media file (PNG/JPG/MP4/PDF)

**Response:**
```json
{
  "success": true,
  "handle": "<opaque handle string>"
}
```

`create-template.js --media-url <url>` calls this automatically.
Use `--media-handle <handle>` to skip re-upload if you already have a handle.

**Supported formats:**

| Template type | Accepted formats |
|--------------|-----------------|
| `image`      | PNG, JPG         |
| `video`      | MP4              |
| `document`   | PDF              |

---

### Delete a template

**DELETE `/api:AFRA_QCy/templates/delete`**

**Auth:** Bearer console token

**Request body:**
```json
{ "whatsapp_template_id": 123456789 }
```

**Response:**
```json
{
  "success": true,
  "result": { "success": true }
}
```

> Template deletion is not wrapped in a script in Phase 2a but the endpoint is documented
> for completeness. Use `get-template.js` to look up `whatsapp_template_id` before deleting.

---

## Template name rules

| Rule | Details |
|------|---------|
| Characters | Lowercase letters (`a–z`), digits (`0–9`), underscores (`_`), Unicode letters |
| Leading character | Must start with a letter (not a digit) |
| Case | Lowercase only — the frontend enforces this |
| Spaces | Not allowed; use underscores instead |
| Max length | 512 characters |

✓ `order_confirmation`, `promo_2024`, `invoice_en`
✗ `OrderConfirmation` (uppercase), `2fa_code` (leading digit), `promo banner` (space)

---

## Categories

| Category | Use case | Meta pricing |
|----------|---------|-------------|
| `MARKETING` | Promotions, offers, product announcements | Marketing conversation rate |
| `UTILITY` | Order updates, confirmations, service notifications | Utility conversation rate |
| `AUTHENTICATION` | OTP / verification codes | Authentication conversation rate |

Authentication templates have a fixed auto-generated body — the `--body` flag is
not used. Xano generates: `<code> is your verification code. For your security,
do not share this code. This code expires in <N> minutes.`

---

## Template types (media)

| Type | Header | Media required |
|------|--------|---------------|
| `text` | None | No |
| `image` | Image (PNG/JPG) | Yes — pre-upload via `/api:ox_LN9zX/get_file_base46_encode` |
| `document` | Document (PDF) | Yes — pre-upload required |
| `video` | Video (MP4) | Yes — pre-upload required |

---

## Button shapes

All button types require an `id` (auto-assigned by `create-template.js`) and `type`.

### Quick Reply
```json
{ "type": "Quick Reply", "text": "Yes" }
```

### Visit Website (static URL)
```json
{
  "type": "Visit Website",
  "buttonText": "View Order",
  "urlType": "static",
  "buttonUrl": "https://example.com/orders"
}
```

### Visit Website (dynamic URL)
```json
{
  "type": "Visit Website",
  "buttonText": "Track",
  "urlType": "dynamic",
  "buttonUrl": "https://example.com/track/",
  "dynamicValue": "order_id"
}
```
Dynamic URLs append a variable at the end: `https://example.com/track/{{1}}`.

### Call Phone Number
```json
{
  "type": "Call Phone Number",
  "buttonText": "Call Us",
  "phoneNumber": "+14155550123"
}
```

### Copy Offer Code
```json
{ "type": "Copy Offer Code", "code": "SAVE20" }
```

### Button limits

| Type | Max |
|------|-----|
| Quick Reply | 10 |
| Visit Website | 2 |
| Call Phone Number | 1 |
| Copy Offer Code | 1 |
| **Total buttons** | **10** |

---

## Body variables

Dynamic content is inserted via numbered placeholders: `{{1}}`, `{{2}}`, etc.

- Must be sequential starting at `{{1}}`
- Must all have example values in `variableValues` — Meta requires examples during review
- Example values are shown to the Meta reviewer; use realistic dummy data

**Example:**
```
Body:    "Hello {{1}}, your order #{{2}} ships on {{3}}."
Variables: { "1": "John", "2": "12345", "3": "Dec 25" }
```

When sending the template (via `POST /api:hFrjh8a1/send_template_message_by_api`),
the `__self` field maps variable indices to actual runtime values:
```json
{ "__self": { "1": "Jane", "2": "67890", "3": "Dec 26" } }
```

---

## Status lifecycle

```
submitted → PENDING → approved   (ready to use)
                    ↘ rejected   (must create a new template; cannot edit and re-submit)
```

- `PENDING` — under Meta review; Xano stores and checks this status literally as `"PENDING"` (uppercase). Typically resolves in under 60 seconds.
- `approved` — template can be used in broadcasts, chat sends, and developer API calls
- `rejected` — template failed Meta review; check `components` for rejection reason

**No manual polling needed** — `list-templates.js` auto-syncs all PENDING templates with
Meta on every call. Simply call it after waiting ~60 seconds to see the updated status:

```bash
# Wait a minute, then list (auto-syncs PENDING status from Meta):
node scripts/list-templates.js --status approved --pretty
# Or check a specific template:
node scripts/get-template.js --name order_confirmation --pretty
```

---

## Chat frontend template endpoint

The chat frontend (`chat.notifyer_frontend`) fetches templates via a different endpoint
that uses **chat auth** (raw token):

**GET `/api:bVXsw_FD/web/templates`**
**Auth:** `Authorization: <token>` (no Bearer prefix)

This is used internally by the chat UI to populate the template picker when composing
messages. The data shape includes a nested `components` object with full WhatsApp
component details, plus `variable_counts`, `name_with_details`, and `template_formate`.
This endpoint is read-only from a management perspective and is not wrapped in a script.

---

## Workflow: Create and verify a template

```bash
# 1. Create the template (submits to Meta; response is Meta API response)
node scripts/create-template.js \
  --name order_ready \
  --category UTILITY \
  --body "Hi {{1}}, your order is ready for pickup at {{2}}." \
  --variables '{"1":"Alice","2":"Store #42"}'

# 2. Wait ~60 seconds, then list — PENDING templates are auto-synced with Meta
#    The returned status is live (no separate polling needed)
node scripts/list-templates.js --pretty

# 3. Or check a specific template by name
node scripts/get-template.js --name order_ready --pretty

# 4. Once approved, verify it appears in the approved list
node scripts/list-templates.js --status approved --pretty

# 4. To send it via developer API (requires api_key):
#    node scripts/get-api-key.js --pretty
#    curl -X POST https://api.insightssystem.com/api:hFrjh8a1/send_template_message_by_api \
#      -H "Content-Type: application/json" \
#      -H "Authorization: <api_key>" \
#      -d '{"phone_number":"14155550123","template":"order_ready","__self":{"1":"Bob","2":"Store #5"}}'
```
