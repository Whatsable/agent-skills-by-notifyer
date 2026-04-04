# Plans & Subscription Reference

Plan endpoints live in the `/api:JZAUyiCs` API group on
`https://api.insightssystem.com`.

---

## GET `/api:JZAUyiCs/plans?filter=<plan-filter>`

Returns the available contact-volume tiers for a specific plan type and billing cycle.

### Auth

```
Authorization: Bearer <token>
```

### Query parameters

| Parameter | Required | Values |
|-----------|----------|--------|
| `filter` | yes | See filter values below |

### Filter values

| Filter | Plan | Billing |
|--------|------|---------|
| `basic-console` | Bulk Message | Monthly |
| `pro-console` | Pro | Monthly |
| `agency-console` | Agency | Monthly |
| `basic-console-annual` | Bulk Message | Annual |
| `pro-console-annual` | Pro | Annual |
| `agency-console-annual` | Agency | Annual |

### Response

Array of `PricingTier` objects — one per contact-volume band:

```json
[
  {
    "id": 1,
    "name_of_plan": "basic-console",
    "What_it_includes": "Bulk messaging, up to 200 unique contacts",
    "unique_numbers": 200,
    "price": 14.99,
    "stripe_price_id": "price_xxx",
    "messaging_credits": 0,
    "number_of_unique_messages": 0
  },
  ...
]
```

### Field reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Internal tier ID |
| `name_of_plan` | string | Internal plan name key (matches filter) |
| `What_it_includes` | string | Human-readable description |
| `unique_numbers` | number | Max unique contacts per billing cycle (shown as the slider value on the pricing page) |
| `price` | number | Price in USD dollars (e.g. `14.99`) |
| `stripe_price_id` | string | Stripe Price ID — used to initiate a checkout session |
| `messaging_credits` | number | Additional messaging credits included |
| `number_of_unique_messages` | number | Additional unique message limit |

### Plan tiers

| Tier key | Display name | Description |
|----------|-------------|-------------|
| `basic` | Bulk Message | Bulk one-way campaigns only. No integrations (Make, Zapier, n8n, etc.), no AI bots, no analytics. |
| `pro` | Pro | Full feature set: 2-way conversations, integrations, AI bots, analytics, scheduling, labels. |
| `agency` | Agency | Everything in Pro plus multiple phone numbers per account. Ideal for agencies managing multiple clients. |

---

## GET `/api:JZAUyiCs/user_plan`

Returns the current user's active subscription details and usage for the billing cycle.

### Auth

```
Authorization: Bearer <token>
```

### Success response

```json
{
  "usages": 142,
  "latest_plan": {
    "id": 1,
    "created_at": 1712000000000,
    "user_id": "uuid-string",
    "stripe_customer_id": "cus_xxx",
    "unique_number_limit": 500,
    "total_unique_number_count": 142,
    "messaging_limit_per_number": 10,
    "start_time": 1712000000000,
    "end_time": 1714592000000,
    "sub_included_credit": 0,
    "plan_amount": 2999,
    "Notes": "",
    "is_team_subscription": false,
    "status": "active",
    "attempt": 0,
    "included_seats": 3,
    "stripe_sub_id": "sub_xxx",
    "price_id": "price_xxx",
    "payment_status": "paid"
  }
}
```

### `latest_plan` field reference

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Subscription status (see below) |
| `plan_amount` | number | Plan price **in cents** — divide by 100 for dollars |
| `unique_number_limit` | number | Max unique contacts allowed per billing cycle |
| `total_unique_number_count` | number | Unique contacts messaged so far this cycle |
| `start_time` | number | Unix timestamp (ms) when subscription started |
| `end_time` | number | Unix timestamp (ms) of next renewal / expiry |
| `included_seats` | number | Team member seats included in plan |
| `is_team_subscription` | boolean | Whether this is a team plan |
| `price_id` | string | Stripe Price ID — matches `PricingTier.stripe_price_id` |
| `stripe_sub_id` | string | Stripe Subscription ID |
| `stripe_customer_id` | string | Stripe Customer ID |
| `payment_status` | string | Stripe payment status (e.g. `"paid"`) |
| `messaging_limit_per_number` | number | Message cap per unique contact |
| `sub_included_credit` | number | Bonus messaging credits included |
| `attempt` | number | Stripe payment retry attempt count |

### `usages`

Top-level `usages` field equals `total_unique_number_count` from `latest_plan` — unique contacts messaged this billing cycle.

### Plan status values

| Status | Meaning |
|--------|---------|
| `new_user` | Free trial — 2 messaging credits, 2 unique numbers |
| `trialing` | Paid trial period (free period from Pro/Agency trial) |
| `active` | Active paid subscription |
| `canceled` | Subscription canceled — no active plan |

### Checking access before sending messages

Agents should gate messaging actions using:

```js
const planOk = ["active", "trialing"].includes(latest_plan?.status);
const withinLimit = usages < latest_plan?.unique_number_limit;
```

---

## Initiating a subscription (browser-only)

`POST /api:Mk_r6mq0/sessions` creates a Stripe checkout session and returns a
redirect URL. This is a **browser-only action** — it cannot be automated from
a script because it requires the user to be redirected to Stripe's payment page
and complete the form.

To subscribe, direct users to: `https://console.notifyer-systems.com/pricing-plans`

---

## Billing model

- Pricing is **per unique contact reached per billing cycle**, not per total contact list
- Limit resets every billing cycle (`end_time` → new `start_time`)
- Each plan tier has multiple volume bands (slider on pricing page); `unique_numbers` is the contact cap for that band
- Annual plans include 2 months free vs monthly equivalent
