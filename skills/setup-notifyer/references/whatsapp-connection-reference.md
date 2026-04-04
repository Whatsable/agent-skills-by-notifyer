# WhatsApp Connection Reference

WhatsApp connection endpoints live in the `/api:P5grzx1u` API group on
`https://api.insightssystem.com`.

---

## GET `/api:P5grzx1u/is_user_embedded`

Returns the full WhatsApp connection status for the authenticated user's account.

### Auth

```
Authorization: Bearer <token>
```

### Success response

```json
{
  "has_embedded_user": true,
  "registration": {
    "success": true,
    "message": "Registered successfully",
    "whatsapp_response": { ... }
  },
  "subscription": {
    "success": true,
    "message": "Subscribed successfully",
    "whatsapp_response": { ... }
  },
  "payment_method_added": false,
  "is_template_has": false,
  "is_message_tested": false,
  "is_profile_picture_added": false
}
```

### Field reference

| Field | Type | Meaning |
|-------|------|---------|
| `has_embedded_user` | boolean | A Meta/Facebook account has been linked via the embedded signup flow |
| `registration.success` | boolean | WhatsApp phone number registered with Meta Business API |
| `subscription.success` | boolean | Subscribed to webhook events from Meta |
| `payment_method_added` | boolean | User has marked a payment method as added in Facebook Business Manager |
| `is_template_has` | boolean | At least one approved message template exists |
| `is_message_tested` | boolean | A test message has been successfully sent |
| `is_profile_picture_added` | boolean | User has added a profile picture to their WhatsApp Business number |

### Derived field: `isConnected`

Computed by the script (not returned by API directly):

```js
isConnected = registration?.success === true && subscription?.success === true
```

When `isConnected = true`, the account can send WhatsApp messages.

### How `has_embedded_user` is computed by Xano

Xano checks: `get_embedded_user.is_empty == false AND get_embedded_user.access_token.is_empty == false`

`has_embedded_user = true` only when the `embedded_users` record both exists **and** has a
non-empty `access_token`. A user who started but didn't finish the Meta OAuth flow may
have a record but no access token, resulting in `has_embedded_user = false`.

### Error sub-object structure

When `registration.success = false` or `subscription.success = false`, the error detail
is nested in `whatsapp_response`:

```js
// Most specific first:
data.registration.whatsapp_response?.error?.error_data?.details
data.registration.whatsapp_response?.error?.message
data.registration.message
```

### Onboarding checklist (5 steps)

The Notifyer console tracks 5 onboarding steps for new accounts:

| Step | Condition | Description |
|------|-----------|-------------|
| 1 | `registration.success && subscription.success` | Connect with Meta account |
| 2 | `payment_method_added` | Add payment method in Facebook Business Manager |
| 3 | `is_template_has` | Create first message template |
| 4 | `is_message_tested` | Send a test message |
| 5 | `is_profile_picture_added` | Add profile picture to WhatsApp Business number |

---

## POST `/api:P5grzx1u/refresher_of_registration_subscription`

Force a re-sync of WhatsApp registration and subscription status with Meta's API.
Use this when the connection status looks stale or failed.

### Auth

```
Authorization: Bearer <token>
```

### Request body

```json
{}
```

### Response

Same shape as `GET /api:P5grzx1u/is_user_embedded`.

### When to use

- After connecting a WhatsApp number in the console and status hasn't updated
- When `registration.success` or `subscription.success` is `false` and you want to retry
- Equivalent to clicking the "Refresh" button in the Notifyer console

### Daily rate limit

Meta limits re-registration attempts per day. The Notifyer console shows a "Daily Limit
Warning" modal before this action. If you hit the limit, the response will indicate an
error — wait 24 hours before calling again.

---

## Connection architecture

Notifyer uses Meta's **Embedded Signup** flow to connect a WhatsApp Business number.
This is a browser-based OAuth flow (requires Meta's JavaScript SDK) — it cannot be
initiated from a script. The `embedding` POST endpoint accepts callbacks from the
Facebook SDK with events: `AUTH`, `FINISH`, `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`,
`CANCEL`, `ERROR`.

**Scripts can only read and refresh status** — the initial connection must be done
through the Notifyer console UI at `https://console.notifyer-systems.com/embedded-signup`.

**1:1 relationship:** Each Notifyer account has exactly one connected WhatsApp Business
number. There is no endpoint to list multiple phone numbers.
