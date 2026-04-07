#!/usr/bin/env node
/**
 * list-broadcasts.js — List broadcasts by status (upcoming / previous / ongoing).
 *
 * GET /api:6_ZYypAc/broadcast?require=<upcoming|previous|ongoing>
 *
 * Usage:
 *   node scripts/list-broadcasts.js                          # upcoming (default)
 *   node scripts/list-broadcasts.js --status previous        # completed broadcasts
 *   node scripts/list-broadcasts.js --status ongoing         # currently sending
 *   node scripts/list-broadcasts.js --status upcoming --pretty
 *
 * Flags:
 *   --status <value>   upcoming | previous | ongoing  (default: upcoming)
 *   --pretty           Print human-readable table to stderr  (optional)
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "status": "upcoming",
 *       "broadcasts": [
 *         {
 *           "id": 5,
 *           "broadcast_name": "January Sale",
 *           "template_name": "promo_banner",
 *           "unique_numbers": "1200",
 *           "delivery_mode": "smart",
 *           "delivery_size": "4",
 *           "schedule": 1706184000000,
 *           "broadcast_identifier": "uuid...",
 *           "cost_of_broadcast": 1.44,
 *           "user_selected_read_rate": 95
 *         }
 *       ],
 *       "count": 1
 *     }
 *   }
 *
 * Additional fields on previous/ongoing:
 *   delivery_success, delivery_fail, message_send_count, message_read_count, batch_percentage
 *
 * Notes:
 *   - `schedule` is a Unix millisecond timestamp. Divide by 1000 for seconds.
 *   - `cost_of_broadcast` is in USD.
 *   - All three status variants query the same `broadcast_schedule` Xano table;
 *     Xano filters internally by broadcast status.
 *   - Every broadcast endpoint sends `Origin: https://console.notifyer-systems.com`
 *     because Xano runs a /cors_origin_console check on all /api:6_ZYypAc endpoints.
 *   - Uses console auth mode (Authorization: Bearer <token>).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const VALID_STATUSES = ["upcoming", "previous", "ongoing"];
const CONSOLE_ORIGIN = "https://console.notifyer-systems.com";

function formatTimestamp(ms) {
  if (!ms) return "N/A";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function printSummary(broadcasts, status) {
  process.stderr.write(`\nBroadcasts — ${status.toUpperCase()} (${broadcasts.length} total)\n`);
  process.stderr.write(`${"─".repeat(100)}\n`);
  process.stderr.write(
    `${"ID".padEnd(5)} ${"Name".padEnd(22)} ${"Template".padEnd(22)} ${"Numbers".padEnd(9)} ${"Mode".padEnd(10)} ${"Schedule".padEnd(18)} ${"Cost".padEnd(8)}\n`
  );
  process.stderr.write(`${"─".repeat(100)}\n`);

  for (const b of broadcasts) {
    const id = String(b.id ?? "").padEnd(5);
    const name = (b.broadcast_name ?? "").slice(0, 21).padEnd(22);
    const tmpl = (b.template_name ?? "").slice(0, 21).padEnd(22);
    const nums = String(b.unique_numbers ?? "").padEnd(9);
    const mode = (b.delivery_mode ?? "").padEnd(10);
    const sched = formatTimestamp(b.schedule).padEnd(18);
    const cost = `$${(b.cost_of_broadcast ?? 0).toFixed(2)}`.padEnd(8);
    process.stderr.write(`${id} ${name} ${tmpl} ${nums} ${mode} ${sched} ${cost}\n`);
  }
  process.stderr.write("\n");
}

async function main() {
  const flags = parseArgs();
  const statusRaw = getFlag(flags, "status") ?? "upcoming";
  const pretty = getBooleanFlag(flags, "pretty");

  const status = statusRaw.toLowerCase();
  if (!VALID_STATUSES.includes(status)) {
    printJson(
      err(`--status must be one of: ${VALID_STATUSES.join(", ")}. Got: "${statusRaw}"`)
    );
    return;
  }

  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:6_ZYypAc/broadcast",
    query: { require: status },
    extraHeaders: { Origin: CONSOLE_ORIGIN },
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  const broadcasts = Array.isArray(result.data) ? result.data : [];

  if (pretty) printSummary(broadcasts, status);

  printJson(ok({ status, broadcasts, count: broadcasts.length }));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
