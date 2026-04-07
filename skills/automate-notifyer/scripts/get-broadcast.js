#!/usr/bin/env node
/**
 * get-broadcast.js — Retrieve a single broadcast by ID, name, or broadcast_identifier.
 *
 * Internally calls GET /api:6_ZYypAc/broadcast across all status groups and filters
 * client-side. There is no dedicated GET-by-ID endpoint.
 *
 * Usage:
 *   node scripts/get-broadcast.js --id 5
 *   node scripts/get-broadcast.js --name "January Sale"
 *   node scripts/get-broadcast.js --broadcast-id "uuid..."
 *   node scripts/get-broadcast.js --id 5 --pretty
 *
 *   # Search only within a specific status group (faster, avoids 3 API calls):
 *   node scripts/get-broadcast.js --id 5 --status previous
 *
 * Flags:
 *   --id <integer>            Notifyer broadcast row ID  (mutually exclusive with --name/--broadcast-id)
 *   --name <text>             Broadcast display name (case-insensitive, first match)  (optional)
 *   --broadcast-id <uuid>     broadcast_identifier UUID  (optional)
 *   --status <value>          Limit search to: upcoming | previous | ongoing  (optional, default: all)
 *   --pretty                  Print human-readable summary to stderr  (optional)
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "found_in": "upcoming",
 *       "broadcast": {
 *         "id": 5,
 *         "broadcast_name": "January Sale",
 *         "template_name": "promo_banner",
 *         "unique_numbers": "1200",
 *         "delivery_mode": "smart",
 *         "delivery_size": "4",
 *         "schedule": 1706184000000,
 *         "broadcast_identifier": "uuid...",
 *         "cost_of_broadcast": 1.44,
 *         "user_selected_read_rate": 95
 *       }
 *     }
 *   }
 *
 * Output (not found):
 *   { "ok": false, "error": "No broadcast found matching the given criteria." }
 *
 * Notes:
 *   - When --status is omitted, all three groups (upcoming, previous, ongoing) are
 *     queried in order. The first match is returned along with `found_in`.
 *   - `schedule` is a Unix millisecond timestamp.
 *   - Name match is case-insensitive and returns the first match.
 *   - Uses console auth mode (Authorization: Bearer <token>).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const ALL_STATUSES = ["upcoming", "previous", "ongoing"];
const CONSOLE_ORIGIN = "https://console.notifyer-systems.com";

function printSummary(broadcast, foundIn) {
  process.stderr.write(`\nBroadcast #${broadcast.id} (found in: ${foundIn})\n`);
  process.stderr.write(`${"─".repeat(60)}\n`);
  process.stderr.write(`  Name             : ${broadcast.broadcast_name ?? "—"}\n`);
  process.stderr.write(`  Template         : ${broadcast.template_name ?? "—"}\n`);
  process.stderr.write(`  Unique Numbers   : ${broadcast.unique_numbers ?? "—"}\n`);
  process.stderr.write(`  Delivery Mode    : ${broadcast.delivery_mode ?? "—"}\n`);
  process.stderr.write(`  Delivery Size    : ${broadcast.delivery_size ?? "—"}\n`);
  if (broadcast.user_selected_read_rate) {
    process.stderr.write(`  Read Rate        : ${broadcast.user_selected_read_rate}%\n`);
  }
  process.stderr.write(
    `  Schedule         : ${broadcast.schedule ? new Date(broadcast.schedule).toLocaleString() : "—"}\n`
  );
  process.stderr.write(`  Cost             : $${(broadcast.cost_of_broadcast ?? 0).toFixed(2)}\n`);
  process.stderr.write(`  Identifier       : ${broadcast.broadcast_identifier ?? "—"}\n`);
  if (broadcast.delivery_success !== undefined) {
    process.stderr.write(`  Delivered        : ${broadcast.delivery_success ?? "—"}\n`);
    process.stderr.write(`  Failed           : ${broadcast.delivery_fail ?? "—"}\n`);
    process.stderr.write(`  Sent             : ${broadcast.message_send_count ?? "—"}\n`);
    process.stderr.write(`  Read             : ${broadcast.message_read_count ?? "—"}\n`);
  }
  process.stderr.write("\n");
}

async function fetchBroadcasts(config, status) {
  const result = await requestJson(config, {
    method: "GET",
    path: "/api:6_ZYypAc/broadcast",
    query: { require: status },
    extraHeaders: { Origin: CONSOLE_ORIGIN },
  });
  if (!result.ok) return { ok: false, error: result.error, status: result.status };
  return { ok: true, data: Array.isArray(result.data) ? result.data : [] };
}

async function main() {
  const flags = parseArgs();
  const idRaw = getFlag(flags, "id");
  const name = getFlag(flags, "name");
  const broadcastUuid = getFlag(flags, "broadcast-id");
  const statusFilter = getFlag(flags, "status")?.toLowerCase();
  const pretty = getBooleanFlag(flags, "pretty");

  if (!idRaw && !name && !broadcastUuid) {
    printJson(
      err(
        "One of --id, --name, or --broadcast-id is required.\n" +
          "  Example: node scripts/get-broadcast.js --id 5"
      )
    );
    return;
  }

  const id = idRaw !== undefined ? Number(idRaw) : undefined;
  if (idRaw !== undefined && (!Number.isInteger(id) || id <= 0)) {
    printJson(err(`--id must be a positive integer, got: ${idRaw}`));
    return;
  }

  if (statusFilter && !ALL_STATUSES.includes(statusFilter)) {
    printJson(err(`--status must be one of: ${ALL_STATUSES.join(", ")}. Got: "${statusFilter}"`));
    return;
  }

  const config = loadConfig({ requireToken: true });
  const statusesToSearch = statusFilter ? [statusFilter] : ALL_STATUSES;

  for (const status of statusesToSearch) {
    const result = await fetchBroadcasts(config, status);
    if (!result.ok) {
      printJson(err(result.error, undefined, false, result.status));
      return;
    }

    let match = null;
    if (id !== undefined) {
      match = result.data.find((b) => b.id === id) ?? null;
    } else if (broadcastUuid) {
      match = result.data.find((b) => b.broadcast_identifier === broadcastUuid) ?? null;
    } else if (name) {
      const needle = name.toLowerCase();
      match = result.data.find((b) => (b.broadcast_name ?? "").toLowerCase() === needle) ?? null;
    }

    if (match) {
      if (pretty) printSummary(match, status);
      printJson(ok({ found_in: status, broadcast: match }));
      return;
    }
  }

  const criteria = idRaw
    ? `id ${idRaw}`
    : broadcastUuid
    ? `broadcast_identifier "${broadcastUuid}"`
    : `name "${name}"`;
  printJson(
    err(
      `No broadcast found matching the given criteria (${criteria})` +
        (statusFilter ? ` in status "${statusFilter}".` : " across upcoming, previous, and ongoing.")
    )
  );
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
