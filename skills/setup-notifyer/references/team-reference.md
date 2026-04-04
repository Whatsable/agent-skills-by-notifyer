# Team Members & Roles Reference

Team management endpoints span two API groups on `https://api.insightssystem.com`:

| Group | Prefix | Used for |
|-------|--------|----------|
| Auth | `/api:-4GSCDHb` | List, create, update, delete members |
| Roles | `/api:eWoClqoZ` | Fetch available label names |

All requests require `Authorization: Bearer <token>`.

---

## Role system

| Role | Label access | Settings access | Assignable via script |
|------|-------------|----------------|----------------------|
| `Super Admin` | All | Full | No — account owner only |
| `Admin` | All | Full | Yes |
| `Team Member (All Labels)` | All | Limited | Yes |
| `Team Member` | Assigned labels only | Limited | Yes |

- **`Super Admin`** is the account owner set at signup. It cannot be created, modified,
  or deleted via the API.
- **`Admin`** and **`Team Member (All Labels)`** automatically get access to all labels —
  the `labels` field is ignored for these roles.
- **`Team Member`** only sees conversations tagged with their assigned labels in the inbox.

---

## GET `/api:-4GSCDHb/auth/get_team_member`

List all team members with pagination.

### Auth

```
Authorization: Bearer <token>
```

### Query parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | `0` | Page number (0-indexed) |
| `per_page` | number | `10` | Items per page |
| `offset` | number | `0` | Record offset (= page × per_page) |

### Response

```json
{
  "items": [
    {
      "id": "uuid-string",
      "name": "Jane Smith",
      "email": "jane@company.com",
      "role": "Admin",
      "labels": ["Sales", "Support"],
      "created_at": "2024-01-15T10:00:00.000Z"
    }
  ],
  "team_seat": {
    "included_seats": 3
  }
}
```

### `team_seat` field

`included_seats` is the number of team member seats included in the current plan.
Additional seats cost $12/seat/month, billed at month end.

---

## GET `/api:eWoClqoZ/role/get_labels`

Fetch all label names defined in the account. Call this before creating/updating a
`Team Member` to know what labels can be assigned.

### Response

Array of label objects:

```json
[
  { "id": "1", "label": "Sales" },
  { "id": "2", "label": "Support" },
  { "id": "3", "label": "VIP" }
]
```

The `label` string (not `id`) is what goes in the `labels` array when creating or
updating a team member.

---

## POST `/api:-4GSCDHb/auth/create_team_member`

Create a new team member account. This does **not** send an email invitation — it
creates a full account immediately. Share credentials with the new member out-of-band.

### Body

```json
{
  "name": "Jane Smith",
  "email": "jane@company.com",
  "password": "Secure@2024",
  "role": "Team Member",
  "labels": ["Sales", "Support"]
}
```

### Field rules

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | 3–120 characters |
| `email` | yes | Unique; used as login credential |
| `password` | yes | No minimum enforced server-side; use a strong password |
| `role` | yes | One of the three assignable roles |
| `labels` | no | Array of label strings; ignored if role is not `Team Member` |

### Success response

The created member object (same shape as `items[]` from `get_team_member`).

### Error: `ERROR_CODE_ACCESS_DENIED`

```json
{ "code": "ERROR_CODE_ACCESS_DENIED", "message": "..." }
```

Returned when:
- The subscription is canceled
- Seat limit is exceeded (contact Notifyer support)

---

## PATCH `/api:-4GSCDHb/auth/user`

Update an existing team member. This single endpoint handles **all** modifications:
role changes, label assignment, name changes, and password resets.

### Body

```json
{
  "team_id": "uuid-of-the-member",
  "name": "Jane Smith",
  "email": "jane@company.com",
  "role": "Admin",
  "labels": [],
  "password": "NewPass@99"
}
```

### Field rules

| Field | Required | Notes |
|-------|----------|-------|
| `team_id` | yes | ID of the member to update (from `get_team_member`) |
| `name` | yes | Send current name to keep unchanged |
| `email` | yes | Immutable — always re-send the existing email |
| `role` | yes | New or current role |
| `labels` | yes | New full label list; send `[]` to clear all |
| `password` | no | Omit entirely (not `null`, not `""`) to keep current |

### Change-role shorthand (via `update-member.js`)

```bash
node scripts/update-member.js --id <id> --role Admin
```

The script fetches the current member, merges only the changed fields, and sends
the full PATCH body. You never need to re-supply unchanged fields.

### Label assignment rules

- Labels must match strings returned by `GET /api:eWoClqoZ/role/get_labels`
- The `labels` array **replaces** the current list entirely — not append
- For `Admin` and `Team Member (All Labels)`, send `labels: []` — backend ignores it
- For `Team Member`, send the complete desired label list

---

## DELETE `/api:-4GSCDHb/auth/delete_team_member/:id`

Permanently remove a team member. **Irreversible.**

### URL parameter

`id` — the member's UUID from `get_team_member`

### Example

```
DELETE /api:-4GSCDHb/auth/delete_team_member/550e8400-e29b-41d4-a716-446655440000
```

### Rules

- `Super Admin` (account owner) cannot be deleted
- The deleted account loses all access immediately
- No response body on success (HTTP 200 with no content, or the deleted record)

---

## Common workflows

### Onboard a new agent operator

```bash
# 1. See what labels exist
node scripts/list-members.js --labels --pretty

# 2. Create the member
node scripts/invite-member.js \
  --name "Support Agent" \
  --email agent@company.com \
  --password "Str0ng@Pass" \
  --role "Team Member" \
  --labels "Support,VIP"

# 3. Verify
node scripts/list-members.js --pretty
```

### Promote a Team Member to Admin

```bash
node scripts/update-member.js --id <id> --role Admin --pretty
```

### Remove label access from a member

```bash
node scripts/update-member.js --id <id> --labels "" --pretty
```

### Off-board a member

```bash
node scripts/remove-member.js --id <id> --confirm --pretty
```
