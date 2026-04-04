#!/usr/bin/env node
/**
 * get-user-plan.js — Get the current user's subscription plan and usage.
 *
 * GET /api:JZAUyiCs/user_plan
 *
 * Usage:
 *   node scripts/get-user-plan.js
 *   node scripts/get-user-plan.js --pretty   # human-readable summary to stderr
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "usages": 142,
 *       "latest_plan": {
 *         "id": 1,
 *         "status": "active",
 *         "plan_amount": 2999,        // in cents → $29.99
 *         "plan_amount_dollars": 29.99,
 *         "unique_number_limit": 500, // max unique contacts per billing cycle
 *         "total_unique_number_count": 142,
 *         "messaging_limit_per_number": 10,
 *         "start_time": 1712000000000,
 *         "end_time": 1714592000000,
 *         "sub_included_credit": 0,
 *         "is_team_subscription": false,
 *         "included_seats": 1,
 *         "price_id": "price_xxx",
 *         "stripe_sub_id": "sub_xxx",
 *         "stripe_customer_id": "cus_xxx",
 *         "payment_status": "paid",
 *         "Notes": "",
 *         "created_at": 1712000000000,
 *         "user_id": "uuid",
 *         "attempt": 0
 *       }
 *     }
 *   }
 *
 * Plan status values:
 *   new_user  → Free trial (2 messaging credits, 2 unique numbers)
 *   trialing  → Paid trial period
 *   active    → Active paid subscription
 *   canceled  → No active plan
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const STATUS_LABELS = {
  new_user: "Free Trial (2 credits, 2 numbers)",
  trialing: "Trial",
  active: "Active",
  canceled: "Canceled — no plan",
};

function printSummary(data) {
  const plan = data.latest_plan;
  if (!plan) {
    process.stderr.write("\nPlan: none\n\n");
    return;
  }

  const status = STATUS_LABELS[plan.status] ?? plan.status;
  const dollars = plan.plan_amount ? `$${(plan.plan_amount / 100).toFixed(2)}` : "N/A";
  const renewDate = plan.end_time ? new Date(plan.end_time).toLocaleDateString() : "N/A";
  const startDate = plan.start_time ? new Date(plan.start_time).toLocaleDateString() : "N/A";
  const usagePct =
    plan.unique_number_limit > 0
      ? `${data.usages ?? 0} / ${plan.unique_number_limit} (${Math.round(((data.usages ?? 0) / plan.unique_number_limit) * 100)}%)`
      : "N/A";

  process.stderr.write(`
Current Plan
────────────
  Status:          ${status}
  Plan amount:     ${dollars}/mo
  Contacts used:   ${usagePct}
  Started:         ${startDate}
  Renews:          ${renewDate}
  Seats included:  ${plan.included_seats ?? "N/A"}
  Team sub:        ${plan.is_team_subscription ? "Yes" : "No"}
  Stripe sub ID:   ${plan.stripe_sub_id ?? "N/A"}
  Price ID:        ${plan.price_id ?? "N/A"}
  Payment status:  ${plan.payment_status ?? "N/A"}
`);
}

async function main() {
  const flags = parseArgs();
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:JZAUyiCs/user_plan",
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  const raw = result.data;

  // Enrich plan_amount_dollars for convenience
  const enriched = {
    usages: raw.usages ?? 0,
    latest_plan: raw.latest_plan
      ? {
          ...raw.latest_plan,
          plan_amount_dollars: raw.latest_plan.plan_amount
            ? raw.latest_plan.plan_amount / 100
            : null,
        }
      : null,
  };

  if (pretty) printSummary(enriched);

  printJson(ok(enriched));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
