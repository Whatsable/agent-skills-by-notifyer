# Broadcasts API Reference

All broadcast endpoints are served from:

```
https://api.insightssystem.com/api:6_ZYypAc
```

Auth mode: **Console** — `Authorization: Bearer <jwt_token>` (from `login.js`).

**IMPORTANT:** Every endpoint in `/api:6_ZYypAc` runs a `/cors_origin_console` custom
function as its first step. Always send the header:

```
Origin: https://console.notifyer-systems.com
```

Scripts handle this automatically via `extraHeaders`. Without this header the CORS
validation may fail.

---

## How Broadcasts Work — 3-Step Flow

A broadcast is not created in a single API call. The process requires three sequential
steps linked by a shared `broadcast_identifier` UUID:

```
Step 1: POST /broadcast_test
        ↓  Sends a test WhatsApp message
        ↓  Creates the broadcast_schedule record in Xano
        ↓  Returns: send_message_response

Step 2: POST /broadcast_user_recipient_numbers  (multipart/form-data)
        ↓  Uploads recipient CSV
        ↓  Xano parses CSV, deduplicates, calculates cost
        ↓  Returns: updated broadcast_schedule (with unique_numbers, cost_of_broadcast)

Step 3: POST /broadcast_schedule
        ↓  Sets delivery mode, batch size, schedule time
        ↓  Finalises the broadcast job
        ↓  Returns: { success, message?, broadcast_id? }
```

The `broadcast_identifier` (UUID) is generated client-side before Step 1 and passed
to all three steps. It links all records together.

`create-broadcast.js` automates all three steps in one command.

---

## Data Model — `broadcast_schedule` record

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-assigned row ID |
| `broadcast_name` | text | Display name |
| `template_name` | text | Name of the WhatsApp template used |
| `unique_numbers` | text | Number of unique recipient phone numbers |
| `delivery_mode` | text | `"smart"` \| `"regular"` \| `"risk"` |
| `delivery_size` | text | Batch size per minute (null for risk) |
| `schedule` | integer | Unix millisecond timestamp of scheduled send time |
| `broadcast_identifier` | text | UUID linking all steps |
| `cost_of_broadcast` | number | Estimated cost in USD |
| `user_selected_read_rate` | number | Target read rate % (smart mode only) |
| `delivery_success` | text | Delivered count (previous/ongoing only) |
| `delivery_fail` | text | Failed count (previous/ongoing only) |
| `message_send_count` | integer | Messages sent (previous/ongoing only) |
| `message_read_count` | integer | Messages read (previous/ongoing only) |
| `batch_percentage` | number | Completion % (ongoing only) |

---

## Endpoints

### `GET /broadcast` — List broadcasts by status

**Script:** `list-broadcasts.js`

```
GET https://api.insightssystem.com/api:6_ZYypAc/broadcast?require=<upcoming|previous|ongoing>
Authorization: Bearer <token>
Origin: https://console.notifyer-systems.com
```

**Query param:** `require` (text) — `"upcoming"` | `"previous"` | `"ongoing"`

**Xano function stack:**
1. `/cors_origin_console` — CORS origin check
2. `/get_user` — authenticate caller
3. Conditional on `input:require`:
   - `"upcoming"` → `Query All Records From broadcast_schedule` (scheduled, not yet sent)
   - `"previous"` → `Query All Records From broadcast_schedule` (completed)
   - `"ongoing"` → `Query All Records From broadcast_schedule` (currently sending)

**Response:** `As Self → var:broadcast_schedule` — direct array of `broadcast_schedule` records.

All three variants query the same table; Xano applies internal filters per branch.

---

### `POST /broadcast_test` — Step 1: Send test + initialise broadcast

> This is a prerequisite for steps 2 and 3. It creates the `broadcast_schedule`
> record that the other steps update.

```
POST https://api.insightssystem.com/api:6_ZYypAc/broadcast_test
Authorization: Bearer <token>
Origin: https://console.notifyer-systems.com
Content-Type: application/json
```

**Request body:**

```json
{
  "template_id": 42,
  "phone_number": "+14155550123",
  "broadcast_identifier": "uuid-v4...",
  "variables": { "1": "John", "2": "#12345" },
  "global_label": ["VIP", "Sales"]
}
```

> `global_label` is an array of label **name strings** (not IDs).
> `variables` maps template variable numbers to sample values.
> `user_id` and `__self` are Xano-internal inputs — do NOT send them.

**Xano function stack:**
1. `/cors_origin_console`
2. `/get_user`
3. `Get Record From template_request` → `pull_template`
4. Lambda → `phone_number_int` (normalises phone number)
5. Lambda → `template_dynamic_data` (prepares template payload)
6. Lambda → `is_media` (checks if template has media header)
7. **Conditional: if `is_media == true`:**
   - 7.1: Custom Function `/File uploader by URL` → `media_controller`
   - 7.2: Lambda → `generate_template_message`
   - (continue) 7.5: Lambda → `send_message_response`
   - 7.9: Add Record In `broadcast_schedule` → `broadcast_schedule1`
   - 7.10: Add Record In `log`
   - 7.11: **Return `var:send_message_response`**
   **Else (non-media):**
   - 7.12: Lambda → `generate_template_message`
   - 7.13: Get Record From `embedded_users`
   - 7.14: Lambda → `send_message_response`
   - 7.18: Add Record In `broadcast_schedule` → `broadcast_schedule2`
   - 7.19: Add Record In `log`
   - 7.20: **Return `var:send_message_response`**

**CRITICAL:** The `broadcast_schedule` record is created at step 7.9 / 7.18 (inside the
conditional). The response is `var:send_message_response` returned via an early `Return`
statement. No Response keys are configured at the endpoint level.

**Response shape (success):**
```json
{ "success": true, "message": "Message sent", "whatsapp_response_info": { ... } }
```

**Response shape (WhatsApp failure):**
```json
{
  "success": false,
  "whatsapp_response_info": {
    "code": 100,
    "type": "OAuthException",
    "message": "...",
    "error_data": { "details": "...", "messaging_product": "whatsapp" }
  }
}
```

Both success and failure return **HTTP 200**. Scripts must check `response.success`.

---

### `POST /broadcast_user_recipient_numbers` — Step 2: Upload recipient CSV

```
POST https://api.insightssystem.com/api:6_ZYypAc/broadcast_user_recipient_numbers
Authorization: Bearer <token>
Origin: https://console.notifyer-systems.com
Content-Type: multipart/form-data
```

**Request:** multipart/form-data with:
- `broadcast_identifier` (uuid string)
- `file` (CSV file)

**Xano function stack:**
1. `/cors_origin_console`
2. `/get_user`
3. `Has Record In user's_recipient_phone_numbers` (by broadcast_identifier) → `any_data_exist`
4. **Conditional: if data already exists:**
   - 4.1: Delete Bulk Records In `user's_recipient_phone_numbers` (clears previous upload)
   - 4.2: Add Or Edit Record In `broadcast_schedule` (resets counts)
5. `CSV Stream input:file` → `stream`
6. `For Each Loop On var:stream As item`:
   - Lambda → normalise CSV row
   - Lambda → extract `phone_number`
   - Get Record From `broadcast_schedule` → `get_cost`
   - Query All Records From `user's_recipient_phone_numbers` → check for duplicate
   - **If NOT duplicate:**
     - Lambda → `cost_by_country_code`
     - `Add Or Edit Record In broadcast_schedule` (updates cost)
     - `Add Record In user's_recipient_phone_numbers` (stores the number)
7. `Get Record From broadcast_schedule` → `broadcast_schedule`

**Response:** `As Self → var:broadcast_schedule` (updated broadcast_schedule record)

```json
{
  "unique_numbers": 1200,
  "cost_of_broadcast": 1.44,
  "existing_credit": 5.0,
  "limit": null
}
```

**Key behaviours:**
- Re-uploading to the same `broadcast_identifier` **replaces** the previous recipient list
- Phone numbers are deduplicated per user — same number in multiple rows is stored only once
- Cost is calculated per country code based on Meta's pricing

**CSV format:**

```csv
phone_number,body1,body2
14155550101,John,12345
14155550102,Jane,67890
```

- `phone_number` column is required (no `+` prefix)
- Variable columns: `body1`, `body2`, `body3`, `media`, `button_dynamic_url_value`
- Download a template CSV from the broadcast console UI

---

### `POST /broadcast_schedule` — Step 3: Finalise and schedule

**Script:** `create-broadcast.js` (step 3 of 3)

```
POST https://api.insightssystem.com/api:6_ZYypAc/broadcast_schedule
Authorization: Bearer <token>
Origin: https://console.notifyer-systems.com
Content-Type: application/json
```

**Request body:**

```json
{
  "broadcast_identifier": "uuid...",
  "schedule": "25/01/2025 14:00",
  "broadcast_name": "January Sale",
  "delivery_mode": "smart",
  "delivery_size": 4,
  "read_rate": 95
}
```

| Field | Type | When required |
|-------|------|---------------|
| `broadcast_identifier` | uuid | Always |
| `schedule` | text (`DD/MM/YYYY HH:mm`) | Always |
| `broadcast_name` | text | Always |
| `delivery_mode` | text (`smart`\|`regular`\|`risk`) | Always |
| `delivery_size` | integer | smart and regular (omit for risk) |
| `read_rate` | integer (1–100) | smart only |

**Xano function stack:**
1. `/cors_origin_console`
2. `/get_user`
3. IP Address Lookup → `user_location`
4. Create Variable: `time_zone` = `user_location.location.tz`
5. Create Variable: `convert` = `input:schedule.parse_timestamp` (parses the schedule string)
6. `Add Or Edit Record In broadcast_schedule` per delivery_mode branch
7. Lambda Function (smart/regular) or Lambda Function (else) → `result`

**TIMEZONE NOTE:** Xano does an **IP Address Lookup** on the calling machine to resolve
timezone. The schedule string `"25/01/2025 14:00"` is interpreted as 2:00 PM in the
timezone of the machine running the script. Always verify the scheduled time in the console.

**Response:** `As Self → var:result`

```json
{ "success": true, "message": "Broadcast scheduled", "broadcast_id": "uuid..." }
```

---

### `DELETE /broadcast/{broadcast_id}` — Delete a scheduled broadcast

> No script provided. Documented for completeness.

```
DELETE https://api.insightssystem.com/api:6_ZYypAc/broadcast/:broadcast_id
Authorization: Bearer <token>
Origin: https://console.notifyer-systems.com
```

**Path parameter:** `broadcast_id` (integer — the `id` field, not `broadcast_identifier`)

**Xano function stack:**
1. `/cors_origin_console`
2. Get Record From `broadcast_schedule`
3. **Delete Bulk Records In `user's_recipient_phone_numbers`** (cascade delete of all recipients)
4. Delete Record In `broadcast_schedule`

**No `/get_user` call** — authentication relies solely on CORS origin check.

**Response:** Empty body (HTTP 200).

Only `upcoming` broadcasts can be deleted — attempting to delete `previous` or `ongoing`
broadcasts may result in unexpected behaviour.

---

### `DELETE /broadcast_user_recipient_numbers` — Remove the recipient list

> Used to clear uploaded recipients before re-uploading a corrected CSV.

```
DELETE https://api.insightssystem.com/api:6_ZYypAc/broadcast_user_recipient_numbers
Authorization: Bearer <token>
Origin: https://console.notifyer-systems.com
Content-Type: application/json
```

**Body:** `{ "broadcast_identifier": "uuid..." }`

**Xano function stack:**
1. `/cors_origin_console`
2. `/get_user`
3. Delete Bulk Records In `user's_recipient_phone_numbers`
4. Add Or Edit Record In `broadcast_schedule` → `reduce_unique_number_limit` (resets counts)
5. Lambda Function → `result`

**Response:** `As Self → var:result` (likely `{ success: true }`)

---

### `GET /download` — Download broadcast results as CSV

```
GET https://api.insightssystem.com/api:6_ZYypAc/download?required=<success|fail|on_queue>&broadcast_identifier=<uuid>
Authorization: Bearer <token>
Origin: https://console.notifyer-systems.com
```

**Query params:**
- `required` (text) — `"success"` | `"fail"` | `"on_queue"`
- `broadcast_identifier` (uuid)

| `required` value | Queries |
|---|---|
| `success` | `broadcast_success_messages` table |
| `fail` | `broadcast_fail_messages` table |
| `on_queue` | `user's_recipient_phone_numbers` table (the pending list) |

**Xano function stack:**
1. `/cors_origin_console`
2. `/get_user`
3. Conditional: query the matching table per `required` value → `model`
4. Extract column names from `model[0]`
5. Loop each row, collect values → `rows`
6. Build CSV string via `csv_create`
7. Set `Content-Disposition: attachment;filename="<name>.csv"`
8. Set `Content-Type: text/csv`

**Response:** Raw CSV text (`Content-Type: text/csv`) — **NOT JSON**.
Must be handled with raw `fetch` and `response.text()` or `response.blob()`.

---

## Delivery Modes Explained

| Mode | Behaviour | Risk |
|------|-----------|------|
| `smart` | Sends in batches, auto-adjusts pacing to hit target read-rate | Low |
| `regular` | Sends fixed batch size per minute | Medium |
| `risk` | Sends all messages at once with no batching | High — Meta may flag account |

The `risk` mode should only be used for very small audiences or urgent alerts. Sending
large volumes at once can trigger Meta's spam detection and temporarily disable the
WhatsApp Business number.

---

## Prerequisites for a Successful Broadcast

1. **WhatsApp connected** — `get-connection-status.js` must show `isConnected: true`
2. **Approved template** — `list-templates.js --status approved` must include the template
3. **Sufficient credit** — check `get-user-plan.js` → `latest_plan.existing_credit`
4. **Active plan** — `latest_plan.status` must be `"active"` or `"trialing"`
5. **Unique contact limit** — `unique_numbers` in the CSV must not exceed `unique_number_limit`
