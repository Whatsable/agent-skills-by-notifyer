# Developer API Key Reference

The Notifyer Developer API key is the credential used by **external automation tools**
(Make, Zapier, n8n, custom scripts) to send messages and access the developer API surface.
It is distinct from the console JWT (`NOTIFYER_API_TOKEN`).

---

## The three Notifyer auth modes

| Mode | Header format | Used by |
|------|--------------|---------|
| Console | `Authorization: Bearer <jwt>` | All console management scripts |
| Chat | `Authorization: <jwt>` (raw, no prefix) | Label CRUD, chat surface endpoints |
| Developer | `Authorization: <api_key>` (raw, no prefix) | Make, Zapier, n8n, `send_template_message_by_api` |

The console JWT and the Developer API key are **different credentials**.
The JWT authenticates you in the console; the API key authenticates external tool calls.

---

## Get the API key

### GET `/api:-4GSCDHb/api_key`

**Auth:** `Authorization: Bearer <jwt>` (console auth — `NOTIFYER_API_TOKEN`)

**Inputs:** None

**Xano function stack:**
1. `cors_origin_console` — sets CORS response headers (does not block)
2. `get_user` — resolves the authenticated user from the Bearer token
3. `Get Record From api_key` — fetches the workspace's `api_key` record

**Response:** Full `api_key` record (`As Self`)

```typescript
interface ApiKeyRecord {
  id: number;
  created_at: number;   // Unix ms
  user_id: string;      // uuid of the workspace owner
  api_key: string;      // the actual Developer API key value
}
```

**Script:**
```bash
node scripts/get-api-key.js
node scripts/get-api-key.js --pretty   # prints key to stderr for easy copying
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "id": 1,
    "created_at": 1700000000000,
    "user_id": "uuid",
    "api_key": "eyJ..."
  }
}
```

---

## What the Developer API key unlocks

### POST `/api:hFrjh8a1/send_template_message_by_api`

Send a WhatsApp template message to any contact. This is the primary endpoint
used by Make, Zapier, n8n automations.

**Auth:** `Authorization: <api_key>` (raw Developer API key — **no Bearer prefix**)

**Inputs:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phone_number` | text | Yes | Recipient's phone number (as a string) |
| `template` | text | Yes | Template name identifier |
| `__self` | json | Yes | Template body — dynamic variable data for the template |
| `sub_channel` | text | No | Set to `"onboarding_test"` for test sends; omit for production |

**Response:** `var:send_message_response` (success/failure of the WhatsApp message send)

**Example (curl):**
```bash
curl -X POST https://api.insightssystem.com/api:hFrjh8a1/send_template_message_by_api \
  -H "Content-Type: application/json" \
  -H "Authorization: <your-api-key>" \
  -d '{
    "phone_number": "14155550123",
    "template": "my_template_name",
    "__self": { "1": "Hello", "2": "World" },
    "sub_channel": ""
  }'
```

**Important notes:**
- `phone_number` is passed as **text** (string), not an integer, at this endpoint.
  This differs from console API calls where phone numbers are typed as integers.
- `__self` contains the dynamic variables for the template (key = variable index).
- `sub_channel: "onboarding_test"` triggers a special code path that updates
  `embedded_users` — only use this for onboarding test sends, not for production.
- The Xano function stack validates business logic, checks subscription limits
  (`subscriber_packages`), handles media uploads if needed, and creates conversation
  + log records on success.

---

## Xano function stack summary (send_template_message_by_api)

1. Lambda — extracts `api_key` from `Authorization` header
2. `Get Record From api_key` — looks up user from key
3. Precondition: `user != null` — rejects invalid keys
4. Creates `user_id` variable
5. `Get Record From template_request` — loads template
6. Lambda — converts `phone_number` to int
7. Custom Function `/business_logics` — validates subscription/limits
8. Precondition: `business_logic_with_payload.success == true`
9. Lambda — builds `template_dynamic_data`
10. Lambda — checks `is_media_exist`
11. Conditional — if media: uploads via `/file uploader by URL` + `/attachment handler`
12. Lambda — generates final `template_message`
13. `Get Record From embedded_users` — fetches WhatsApp phone config
14. Lambda — sends message via Meta API → `send_message_response`
15. Conditional on success:
    - Adds record to `conversation`, `log`, `success_messaging_templates`
    - Updates `subscriber_packages` (usage count)
    - If `sub_channel == "onboarding_test"`: updates `embedded_users`
    - Calls `/recipient_create`
16. On failure: adds to `fail_messaging`

**Response:** `send_message_response`

---

## Notes for automation tool integrations

When setting up **Make / Zapier / n8n** with Notifyer:

1. Get your API key: `node scripts/get-api-key.js --pretty`
2. In the automation tool, set the HTTP request Authorization header to the raw key value (no "Bearer")
3. Use `POST /api:hFrjh8a1/send_template_message_by_api` as the webhook/HTTP action endpoint
4. Verify `status ∈ ["active", "trialing"]` and `usages < unique_number_limit` before triggering
   (use `node scripts/get-user-plan.js` to check)
5. **Use the "Notifyer Systems" module** when configuring Make or Zapier — the console
   explicitly warns against using the "WhatsAble" module. The correct module is "Notifyer Systems".

---

## Plan requirement

The API key can be **fetched** by any authenticated user, but **using** it for automation requires a **Pro or Agency plan**. Basic (Bulk Message) plan users are blocked in the console UI with an upgrade prompt.

Check plan status before directing users to set up integrations:

```bash
node scripts/get-user-plan.js --pretty
# Check: status must be "active" or "trialing", and plan tier must NOT be basic-console
```

The plan tier can be determined by comparing `latest_plan.price_id` against the `stripe_price_id` values returned by `GET /api:JZAUyiCs/plans?filter=basic-console` and `GET /api:JZAUyiCs/plans?filter=basic-console-annual`. If it matches either, the user is on the Bulk Message plan and needs to upgrade.

---

## No rotate/regenerate

There is no rotate or regenerate endpoint in the current API surface. The API key is
fixed for the workspace lifetime. Treat it as a secret: store it in environment variables,
never commit it to source control.
