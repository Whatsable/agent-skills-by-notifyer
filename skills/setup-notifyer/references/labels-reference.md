# Labels Reference

Detailed reference for the Notifyer label management API.
All endpoints are under the `api:bVXsw_FD` group (Chat/Web surface).

---

## API endpoints

### GET `/api:bVXsw_FD/web/label_management`

List all workspace labels visible to the authenticated user.

**Auth:** `Authorization: <token>` (chat auth — raw token, no `Bearer` prefix)

**Inputs:** None (no query params, no body)

**Xano function stack:**
1. `cors_origin_web_chat` — sets CORS response headers
2. `get_user` — resolves the authenticated user from the token
3. **Conditional** on role:
   - `Super Admin` or `Admin` → `Query All Records From label_management` (returns all)
   - Otherwise → creates `user_id` and `labels` variables from the user record,
     queries `label_management` filtered by `user.labels`, then applies a Lambda
     to return only the user's assigned label records

**Response:** `Label[]` (JSON array)

**Role-filtering behaviour:**
| Role | Labels returned |
|------|----------------|
| Super Admin | All workspace labels |
| Admin | All workspace labels |
| Team Member (All Labels) | Only labels assigned to this member |
| Team Member | Only labels assigned to this member |

---

### POST `/api:bVXsw_FD/web/label_management`

Create a new workspace label.

**Auth:** `Authorization: <token>` (chat auth)

**Request body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `label` | string | Yes | Display name; must be unique across the workspace |
| `keywords` | string[] (JSON) | Yes | Auto-assignment trigger words; use `[]` for none |

> `created_at` and `user_id` are accepted by the endpoint schema but are
> auto-populated by Xano from the authenticated user context — do not send them.

**Xano function stack:**
1. `cors_origin_web_chat`
2. `get_user`
3. `Query All Records From label_management` → `has_label_exist`
4. `Precondition: var:has_label_exist == false` — **blocks with error if label already exists**
5. `Add Record In label_management` → new label record

**Response:** The newly created `Label` object (`As Self`)

**Error — duplicate label:**
Xano fires a precondition error (HTTP 400) if a label with the same name already exists.
`create-label.js` surfaces this as `{ ok: false, error: "A label named '...' already exists.", blocked: true }`.

---

### PATCH `/api:bVXsw_FD/web/label_management/{label_management_id}`

Update a label's name and/or keywords.

**Auth:** `Authorization: <token>` (chat auth)

**Path param:** `label_management_id` — integer

**Request body (table spread):**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `label` | string | Yes | Display name (pass existing value to keep unchanged) |
| `created_at` | timestamp (int) | Yes | Unix ms; must be passed through from the existing record |
| `keywords` | string[] (JSON) | Yes | Full replacement list — `[]` clears all keywords |

> `user_id` is part of the endpoint schema but should **not** be sent —
> the frontend omits it and Xano preserves the existing value via `Edit Record`.

**Xano function stack:**
1. `cors_origin_web_chat`
2. `get_user`
3. `Edit Record In label_management` — direct overwrite with provided fields

**Response:** The updated `Label` object (`As Self`)

**Pattern used by scripts:** `update-label-keywords.js` always fetches the current
label list first (`GET /web/label_management`), finds the target by id, then patches
with the full body — preserving `created_at` and `label` for fields not being changed.

---

### DELETE `/api:bVXsw_FD/web/label_management/{label_management_id}`

Permanently delete a label.

**Auth:** `Authorization: <token>` (chat auth)

**Path param:** `label_management_id` — integer

**Request body:** None

**Xano function stack:**
1. `cors_origin_web_chat`
2. `get_user`
3. `Delete Record In label_management`

**Response:** Empty body (no JSON returned). The script synthesises
`{ deleted: true, id, label }` from the pre-flight fetch.

---

## Label data model

```typescript
interface Label {
  id: number;          // integer primary key
  label: string;       // display name shown in UI and assigned to conversations
  keywords: string[];  // auto-assignment triggers (JSON array of strings)
  user_id: string;     // uuid of the workspace owner who created the label
  created_at: number;  // Unix timestamp in milliseconds
}
```

---

## Auth mode

Label management endpoints live in the **Chat** Xano API group (`api:bVXsw_FD`).
They require the **chat auth** format:

```
Authorization: <token>          ← raw JWT, no "Bearer" prefix
```

This is distinct from console-surface endpoints which use `Authorization: Bearer <token>`.

The **same token** from `login.js` works for both surfaces — only the header format differs.
`notifyer-api.js` handles this via `AUTH_MODE_CHAT`:

```javascript
import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
const config = loadConfig({ authMode: AUTH_MODE_CHAT });
```

---

## How keywords work

Keywords are **auto-assignment triggers**. When an incoming WhatsApp message contains
a word that matches a label's keyword, Notifyer automatically assigns that label to the
conversation.

- Matching is **case-insensitive** in the chat engine.
- A conversation can have multiple labels assigned simultaneously.
- Keywords on different labels are independent — a single message can trigger multiple labels.
- Removing a keyword stops future auto-assignment but does not un-assign the label from
  existing conversations.

---

## Role-filtered GET

The GET endpoint's behaviour depends on the authenticated user's role.
This matters for agents:

- **Admin/Super Admin:** always see all labels — safe to call `list-labels.js` to discover
  what labels exist before creating or updating.
- **Team Members:** only see their assigned labels — calling `list-labels.js` will not
  return labels they are not assigned to, even if those labels exist.

For label management operations (create, update, delete) an **Admin or Super Admin**
token should be used.

---

## Common workflows

### Create a label with keywords
```bash
node scripts/create-label.js --label "Billing" --keywords "invoice,refund,payment,charge"
```

### Add a keyword to an existing label
```bash
# First find the id
node scripts/list-labels.js --pretty

# Then add the keyword
node scripts/update-label-keywords.js --id 5 --add "receipt"
```

### Remove one keyword without touching others
```bash
node scripts/update-label-keywords.js --id 5 --remove "old-keyword"
```

### Replace all keywords at once
```bash
node scripts/update-label-keywords.js --id 5 --set "buy,purchase,order,checkout"
```

### Clear all keywords (disable auto-assignment)
```bash
node scripts/update-label-keywords.js --id 5 --set ""
```

### Rename a label
```bash
node scripts/update-label-keywords.js --id 5 --label "VIP Customers"
```

### Delete a label
```bash
# Verify first
node scripts/list-labels.js --pretty

# Delete with confirmation
node scripts/delete-label.js --id 5 --confirm
```

> **After deletion:** remove the deleted label from any team members that had it
> assigned, using `update-member.js --id <member-id> --labels "..."`.

---

## Related scripts

| Script | Purpose |
|--------|---------|
| `list-labels.js` | List all labels (and their keywords) |
| `create-label.js` | Create a new label |
| `update-label-keywords.js` | Add, remove, replace keywords, or rename a label |
| `delete-label.js` | Permanently delete a label |
| `list-members.js --labels` | List team members + available label names together |
| `invite-member.js --labels` | Create a member and assign labels in one call |
| `update-member.js --labels` | Replace a member's assigned label list |
