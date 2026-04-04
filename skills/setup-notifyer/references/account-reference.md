# Account & Authentication Reference

Notifyer's auth endpoints live in the `/api:-4GSCDHb` API group on
`https://api.insightssystem.com`.

---

## POST `/api:-4GSCDHb/auth/signup`

Create a new Notifyer account. No authentication required.

### Request body

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Full name of the account owner |
| `email` | string | yes | Email address. Lowercase before sending. |
| `password` | string | yes | See password rules below |
| `phone_number` | **integer** | yes | Phone number including country code, digits only. Sent as a JSON number, not a string. e.g. `14155550123` |
| `reason_of_automate` | string | yes | Why the user wants to automate with WhatsApp |

> **phone_number is an integer** — Xano types this field as `integer`. Pass `14155550123`, not `"14155550123"`.

### Password rules (validated client-side before sending)

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (e.g. `@`, `!`, `#`, `$`, `%`, `^`, `&`, `*`)

### What signup creates (Xano function stack)

1. Looks up `user` by email → precondition: must be `null` (new user only)
2. Generates UUID as `user_id`
3. Adds record in `user` table
4. Creates authentication token → `authToken`
5. Adds record in `api_key` table (your developer API key)
6. Adds record in `subscriber_packages` table (default plan)
7. Fires a Make webhook (internal onboarding notification)

All of this happens in a single API call — no follow-up calls needed.

### Success response

```json
{
  "authToken": "eyJhbGciOiJBMjU2S1ciLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIn0...",
  "user": {
    "id": 42,
    "name": "Jane Smith",
    "email": "jane@company.com",
    "role": "Admin",
    "phone_number": 14155550123,
    "created_at": 1712000000000
  }
}
```

The `authToken` is a JWT. Export it immediately:

```bash
export NOTIFYER_API_TOKEN=<authToken>
```

### Error cases

| Cause | Xano behavior | Script output |
|-------|--------------|---------------|
| Email already exists | Precondition `var:user == null` fails | `{ ok: false, error: "Precondition failed" }` |
| Missing field | Xano validation error | `{ ok: false, error: "..." }` |

---

## POST `/api:-4GSCDHb/auth/login`

Login with email and password. No authentication required.

### Request body

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | yes | Lowercase before sending |
| `password` | string | yes | |

### Required request header

```
Origin: https://console.notifyer-systems.com
```

**Why this is required:** The Xano function stack reads `$http_headers.Origin` (step 5) and validates that Admin and Super Admin users are logging in from the console URL. Without this header, Admin/Super Admin logins will fail preconditions 6 and 7 in the Xano stack. Regular users are less affected but the header should always be sent.

### Xano function stack (login)

1. Get Record From `user` by email
2. Precondition: `var:user != null` (user must exist)
3. Validate Password → `pass_result`
4. Precondition: `var:pass_result == true`
5. Create Variable: `var:origin = env:$http_headers.Origin`
6. Precondition: `var:origin == https://console.notifyer-systems.com AND var:user.role == Admin`
7. Precondition: `var:origin == https://console.notifyer-systems.com AND var:user.role == Super Admin`
8. Get Record From `user`
9. Create Authentication Token → `authToken`

### Success response

```json
{
  "authToken": "eyJhbGciOiJBMjU2S1ciLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIn0..."
}
```

### Error cases

| Cause | Script output |
|-------|---------------|
| Wrong email | `{ ok: false, error: "Precondition failed" }` (user not found) |
| Wrong password | `{ ok: false, error: "Precondition failed" }` (password validation fails) |
| Admin/Super Admin without Origin header | Precondition error |

---

## GET `/api:-4GSCDHb/auth/me`

Get the currently authenticated user's profile.

### Request headers

```
Authorization: Bearer <authToken>
```

### Success response

```json
{
  "id": 42,
  "name": "Jane Smith",
  "email": "jane@company.com",
  "role": "Admin",
  "phone_number": 14155550123,
  "created_at": 1712000000000
}
```

### User roles

| Role | Access level |
|------|-------------|
| `Admin` | Full workspace admin (the account owner) |
| `Super Admin` | Platform-level admin (WhatsAble staff) |
| `Member` | Regular team member |

---

## Auth header format — Console vs Chat

Scripts in `setup-notifyer` and `automate-notifyer` target the **Console API**
and use:

```
Authorization: Bearer <token>
```

Scripts in `chat-notifyer` target the **Chat API** and use a **raw token
with no Bearer prefix**:

```
Authorization: <token>
```

This is handled automatically by `notifyer-api.js` based on the `authMode`
option passed to `loadConfig()`.

---

## Token storage

Never commit tokens to source control. Use environment variables:

```bash
export NOTIFYER_API_BASE_URL=https://api.insightssystem.com
export NOTIFYER_API_TOKEN=<authToken>
```
