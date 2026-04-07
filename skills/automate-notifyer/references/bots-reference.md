# AI Bots API Reference

All AI Bot endpoints are served from:

```
https://api.insightssystem.com/api:Sc_sezER
```

Auth mode: **Console** — `Authorization: Bearer <jwt_token>` (from `login.js`).

---

## Data Model — `bot_config` record

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Notifyer bot ID (auto-assigned) |
| `created_at` | datetime | ISO 8601 creation timestamp |
| `user_id` | uuid | Owner's user ID |
| `bot_name` | text | Display name of the bot |
| `mission` | text | Bot's stated purpose / goal |
| `system_prompt` | text | Raw system-level instructions for the OpenAI Assistant |
| `knowledge_base` | text | Plain-text knowledge the bot uses to answer questions |
| `tone` | text | Personality tone (e.g. `"Friendly"`, `"Professional"`, `"Casual"`) |
| `openai_assistant_id` | text | The OpenAI Assistant ID (`asst_...`) — set by Xano automatically |
| `delay` | integer | Seconds to wait before sending each reply (simulates typing) |
| `default` | bool | Whether this is the workspace default bot |
| `notification` | bool | Whether human-handoff triggers a notification alert |
| `human_trigger_keywords` | jsonb (array) | Keywords that trigger a human handoff |
| `handoff_instruction` | text | Message sent to the user when handoff is triggered |
| `files_metadatas` | json (array) | Array of Xano attachment metadata objects for uploaded files |
| `file_texts` | json (object) | Map of `{ [file_path]: "extracted text content" }` for uploaded files |

---

## Endpoints

### `GET /ai_config` — List all bots

**Script:** `list-bots.js`

```
GET https://api.insightssystem.com/api:Sc_sezER/ai_config
Authorization: Bearer <token>
```

**Xano function stack:**
1. Custom Function `/get_user` — authenticates the caller
2. `Query All Records From bot_config` → `var:model`

**Response:** `As Self → var:model`

Returns a **direct array** of `bot_config` records (not paginated, not wrapped in an object). Example:

```json
[
  {
    "id": 12,
    "bot_name": "Support Bot",
    "mission": "Help users resolve support issues.",
    "tone": "Friendly",
    "delay": 3,
    "default": true,
    "notification": true,
    "human_trigger_keywords": ["agent", "human"],
    "handoff_instruction": "Connecting you with a human...",
    "openai_assistant_id": "asst_abc123",
    "knowledge_base": "...",
    "system_prompt": "...",
    "files_metadatas": [],
    "file_texts": {},
    "user_id": "uuid...",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
]
```

> All bots in the workspace are returned — not filtered by calling user.

---

### `GET /ai_config/:id` — Get a single bot

**Script:** `get-bot.js`

```
GET https://api.insightssystem.com/api:Sc_sezER/ai_config/:ai_config_id
Authorization: Bearer <token>
```

**Path parameter:** `ai_config_id` (integer)

**Xano function stack:**
1. Custom Function `/get_user` — authenticates the caller
2. `Get Record From bot_config` → `var:model`
3. `Precondition: var:model != null` — if ID does not exist, fires HTTP 400

**Response:** `As Self → var:model` — single `bot_config` record.

**Error (not found):** HTTP 400 `"Precondition Failed"` — script maps this to:
```json
{ "ok": false, "error": "Bot with id 99 not found.", "status": 400 }
```

---

### `POST /ai_config` — Create a bot

**Script:** `create-bot.js`

```
POST https://api.insightssystem.com/api:Sc_sezER/ai_config
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**

```json
{
  "bot_name": "Support Bot",
  "mission": "Help users resolve support issues quickly.",
  "system_prompt": "You are a friendly support agent. Be concise and helpful.",
  "knowledge_base": "Our return policy is 30 days. Shipping takes 3-5 business days.",
  "tone": "Friendly",
  "delay": 3,
  "default": false,
  "notification": true,
  "human_trigger_keywords": ["agent", "human", "speak to person"],
  "handoff_instruction": "I'll connect you with a human agent now.",
  "files_metadatas": [],
  "file_texts": {}
}
```

**Fields NOT sent** (set by Xano automatically):
- `created_at` — auto-timestamp
- `user_id` — resolved from auth token via `/get_user`
- `openai_assistant_id` — set after OpenAI API call

**Xano function stack:**
1. Custom Function `/get_user` → `user`
2. **Lambda Function** — builds `modified_system_prompt` by merging `mission`, `knowledge_base`, and `system_prompt` into a single OpenAI instruction block
3. **`API Request To https://api.openai.com/v1/assistants`** → `open_ai_assistant_id_create`
   - Creates an OpenAI Assistant using your workspace's configured OpenAI API key
4. **Conditional: `if open_ai_assistant_id_create.response.status != 200`**
   - **If OpenAI FAILS:**
     - 4.1: Add Record In `team_creation_log` (error log)
     - 4.2: Return `var:team_creation_log1` ← HTTP 200 but NOT a bot record
   - **If OpenAI SUCCEEDS (Else):**
     - 4.3: Add Record In `team_creation_log` (success log)
     - 4.4: Add Record In `bot_config` → `var:model`
     - 4.5: Return `var:model` ← the created `bot_config` record

**CRITICAL:** Both success and failure return **HTTP 200**. The response shape differs:
- **Success:** response has `bot_name` field → it is a `bot_config` record
- **Failure:** response lacks `bot_name` → it is a `team_creation_log` error record

The `create-bot.js` script detects this and returns `{ ok: false, blocked: true, ... }` on OpenAI failure.

**No duplicate name check** — multiple bots with the same `bot_name` are allowed.

**Why OpenAI creation can fail:**
- No OpenAI API key configured in the workspace Notifyer settings
- Workspace is on Basic plan (no OpenAI integration)
- OpenAI rate limit or service outage

---

### `PATCH /ai_config/:id` — Update a bot

> No script provided in Phase 2b. Documented for completeness.

```
PATCH https://api.insightssystem.com/api:Sc_sezER/ai_config/:ai_config_id
Authorization: Bearer <token>
Content-Type: application/json
```

**Path parameter:** `ai_config_id` (integer)

**Request body:** Same fields as POST (only include fields you want to update — uses `Get All Raw Input`).

**Xano function stack:**
1. `/get_user`
2. `Get All Raw Input` → `raw_input` (only supplied fields are updated)
3. `Get Record From bot_config` → `bot_config_data`
4. Lambda Function → `instructions` (rebuilds the OpenAI instruction block)
5. **`API Request To https://api.openai.com/v1/assistants/:id`** (PATCH) → `update_bot`
6. **`Precondition: var:update_bot.response.status == 200`** — if OpenAI PATCH fails, endpoint returns HTTP 400
7. `Patch Record In bot_config` → `model`

**Response:** `As Self → var:update_bot` — the OpenAI API response (not the updated `bot_config` record).

> Updates also re-sync with OpenAI. If OpenAI returns non-200, the update is blocked (HTTP 400 from Precondition).

---

### `DELETE /ai_config/:id` — Delete a bot

> No script provided in Phase 2b. Documented for completeness.

```
DELETE https://api.insightssystem.com/api:Sc_sezER/ai_config/:ai_config_id
Authorization: Bearer <token>
```

**Path parameter:** `ai_config_id` (integer)

**Xano function stack:**
1. `/get_user`
2. `Delete Record In bot_config`

**Response:** Empty body (HTTP 200 with no response keys).

> No ownership check — any authenticated user can delete any bot by ID. Use with caution.

---

### `PATCH /ai_config/set-as-default/:id` — Set the workspace default bot

> No script provided in Phase 2b. Documented for completeness.

```
PATCH https://api.insightssystem.com/api:Sc_sezER/ai_config/set-as-default/:bot_config_id
Authorization: Bearer <token>
```

**Path parameter:** `bot_config_id` (integer)

**Xano function stack:**
1. `/get_user` → `user`
2. **Precondition: `var:user.role == "Super Admin" OR var:user.role == "Admin"`**
   - Team Members are blocked (HTTP 400 "Precondition Failed")
3. `Query All Records From bot_config` → `bots`
4. `For Each Loop On var:bots As bot`:
   - If `var:bot.id == input:bot_config_id`:
     - `Add Or Edit Record In bot_config` (sets `default: true`) → `set_as_default`
   - Else:
     - `Add Or Edit Record In bot_config` (sets `default: false`) → `set_as_normal`

**Response:** Empty body (HTTP 200 with no response keys).

This is **mutually exclusive** — only ONE bot can be the workspace default at a time. Setting one bot as default automatically unsets all others.

---

### `POST /ai_config/files` — Upload a file for the knowledge base

> Not wrapped in a script — file upload requires multipart form submission.

```
POST https://api.insightssystem.com/api:Sc_sezER/ai_config/files
Content-Type: multipart/form-data
```

**Note:** This is a **Public Endpoint** in Xano (no auth gate on the endpoint itself),
but the Notifyer frontend still sends `Authorization: Bearer <token>` as a precaution.

**Input:** `file` (file resource / multipart)

**Xano function stack:**
1. `Create Attachment From input:file` → `metadata`
2. **Precondition: `var:metadata.size <= 10000000`** (10 MB limit exactly — 10,000,000 bytes)

**Response:** `As Self → var:metadata`

The `metadata` object is a standard Xano attachment:

```json
{
  "access": "public",
  "path": "/vault/...",
  "name": "knowledge.pdf",
  "type": "pdf",
  "size": 204800,
  "mime": "application/pdf",
  "meta": {}
}
```

This `metadata` object should be collected into `files_metadatas[]` and passed to
`POST /ai_config` (or `PATCH /ai_config/:id`) along with the extracted `file_texts`.

**Supported formats (from frontend):** TXT, CSV, PDF, DOCX

---

## Knowledge Base Workflow

### Text only (simple — supported by `create-bot.js`)

Pass knowledge directly in the `--knowledge-base` flag:

```bash
node scripts/create-bot.js \
  --name "FAQ Bot" \
  --knowledge-base "Return policy: 30 days. Shipping: 3-5 days. Contact: support@company.com"
```

### File-based knowledge base (advanced — requires manual steps)

1. Upload the file:

```bash
curl -X POST https://api.insightssystem.com/api:Sc_sezER/ai_config/files \
  -H "Authorization: Bearer $NOTIFYER_API_TOKEN" \
  -F "file=@/path/to/knowledge.pdf"
```

2. Extract text from the file (client-side for TXT/CSV; parse PDF/DOCX with a tool).

3. Include both `files_metadatas` and `file_texts` in the bot creation payload:

```json
{
  "bot_name": "Doc Bot",
  "files_metadatas": [
    { "access": "public", "path": "/vault/...", "name": "knowledge.pdf", ... }
  ],
  "file_texts": {
    "/vault/...": "Full extracted text content of the file..."
  }
}
```

---

## Plan Requirement

AI Bots require a **Pro** or **Agency** subscription plan.

On the **Basic** plan:
- `list-bots.js` and `get-bot.js` will still work (they just read records)
- `create-bot.js` will fail because Xano calls the OpenAI API which requires an OpenAI key
  configured in the workspace settings — typically only enabled on paid plans

Always verify plan status before attempting bot creation:

```bash
node scripts/get-user-plan.js --pretty
```

Check that `latest_plan.status` is `"active"` or `"trialing"` and the plan is `"pro"` or `"agency"`.

---

## Role Requirement for `set-as-default`

`PATCH /ai_config/set-as-default/:id` requires the caller to have role `"Super Admin"` or `"Admin"`.
Team Members cannot change the default bot.

Creating and deleting bots has no explicit role check beyond authentication.

---

## Bot Assignment in Chat

Bots are assigned to WhatsApp conversations in the Chat frontend (`chat.notifyer_frontend`):
- The chat Redux store (`messengerSlice.ts`) fetches bots via `GET /api:Sc_sezER/ai_config`
  using **chat auth** (raw `Authorization: <token>`, no Bearer prefix)
- Bot assignment is done by updating the recipient record:
  `PATCH /recipient/:id` with `{ ai_bot_id: <bot_id> }`

> `list-bots.js` uses console auth. The same bot list is readable from chat auth too —
> the underlying data is the same `bot_config` table.
