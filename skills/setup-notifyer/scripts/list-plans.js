#!/usr/bin/env node
/**
 * list-plans.js — List available Notifyer subscription plans.
 *
 * GET /api:JZAUyiCs/plans?filter=<plan-filter>
 *
 * Usage:
 *   node scripts/list-plans.js                           # all plans, all tiers
 *   node scripts/list-plans.js --billing monthly         # monthly plans only
 *   node scripts/list-plans.js --billing annual          # annual plans only
 *   node scripts/list-plans.js --tier pro                # Pro tier only
 *   node scripts/list-plans.js --tier basic --billing monthly
 *   node scripts/list-plans.js --pretty                  # human-readable table to stderr
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "monthly": {
 *         "basic":  [ { id, name_of_plan, price, unique_numbers, stripe_price_id, ... } ],
 *         "pro":    [ ... ],
 *         "agency": [ ... ]
 *       },
 *       "annual": {
 *         "basic":  [ ... ],
 *         "pro":    [ ... ],
 *         "agency": [ ... ]
 *       }
 *     }
 *   }
 *
 * Each tier entry represents one contact-volume band (the slider on the pricing page).
 * Price is in dollars (e.g. 29.99). unique_numbers is the max unique contacts per cycle.
 * stripe_price_id is used to initiate a Stripe checkout session (browser-only action).
 *
 * Plans:
 *   basic  → "Bulk Message" — bulk messaging only, no integrations, no AI bots
 *   pro    → "Pro"          — full feature set, integrations, AI bots, analytics
 *   agency → "Agency"       — everything in Pro + multiple phone numbers per account
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const FILTER_MAP = {
  monthly: {
    basic: "basic-console",
    pro: "pro-console",
    agency: "agency-console",
  },
  annual: {
    basic: "basic-console-annual",
    pro: "pro-console-annual",
    agency: "agency-console-annual",
  },
};

const TIER_DISPLAY = {
  basic: "Bulk Message",
  pro: "Pro",
  agency: "Agency",
};

function usage() {
  console.error(`
Usage:
  node scripts/list-plans.js [--billing monthly|annual] [--tier basic|pro|agency] [--pretty]

Flags:
  --billing   Filter by billing cycle: monthly | annual (default: both)
  --tier      Filter by plan tier: basic | pro | agency (default: all)
  --pretty    Print a human-readable summary to stderr

Environment:
  NOTIFYER_API_BASE_URL   required
  NOTIFYER_API_TOKEN      required
`);
  process.exit(1);
}

function printSummary(data) {
  for (const [billing, tiers] of Object.entries(data)) {
    for (const [tier, tierData] of Object.entries(tiers)) {
      if (!tierData || !tierData.length) continue;
      process.stderr.write(`\n${TIER_DISPLAY[tier] ?? tier} — ${billing}\n`);
      process.stderr.write(`  ${"Contacts".padEnd(12)} ${"Price/mo".padEnd(12)} Stripe Price ID\n`);
      process.stderr.write(`  ${"─".repeat(48)}\n`);
      for (const t of tierData) {
        const contacts = String(t.unique_numbers).padEnd(12);
        const price = (`$${t.price}`).padEnd(12);
        process.stderr.write(`  ${contacts} ${price} ${t.stripe_price_id}\n`);
      }
    }
  }
  process.stderr.write("\n");
}

async function fetchFilter(config, filterKey) {
  const result = await requestJson(config, {
    method: "GET",
    path: "/api:JZAUyiCs/plans",
    query: { filter: filterKey },
  });
  if (!result.ok) return { ok: false, error: result.error, filter: filterKey };
  return { ok: true, data: Array.isArray(result.data) ? result.data : [] };
}

async function main() {
  const flags = parseArgs();
  const billing = getFlag(flags, "billing");
  const tier = getFlag(flags, "tier");
  const pretty = getBooleanFlag(flags, "pretty");

  const validBillings = ["monthly", "annual"];
  const validTiers = ["basic", "pro", "agency"];

  if (billing && !validBillings.includes(billing)) {
    console.error(`Error: --billing must be one of: ${validBillings.join(", ")}`);
    usage();
  }
  if (tier && !validTiers.includes(tier)) {
    console.error(`Error: --tier must be one of: ${validTiers.join(", ")}`);
    usage();
  }

  const config = loadConfig({ requireToken: true });

  const billingsToFetch = billing ? [billing] : validBillings;
  const tiersToFetch = tier ? [tier] : validTiers;

  const result = { monthly: {}, annual: {} };
  const errors = [];

  for (const b of billingsToFetch) {
    for (const t of tiersToFetch) {
      const filterKey = FILTER_MAP[b][t];
      const res = await fetchFilter(config, filterKey);
      if (!res.ok) {
        errors.push(`${b}/${t}: ${res.error}`);
        result[b][t] = [];
      } else {
        result[b][t] = res.data;
      }
    }
  }

  // Remove billing cycles not requested
  if (billing) {
    for (const b of validBillings) {
      if (b !== billing) delete result[b];
    }
  }

  if (errors.length > 0 && Object.values(result).every((b) => Object.values(b).every((t) => !t.length))) {
    printJson(err(`Failed to fetch plans: ${errors.join("; ")}`));
  }

  if (pretty) printSummary(result);

  printJson(ok(result));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
