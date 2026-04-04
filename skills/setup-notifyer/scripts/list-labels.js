#!/usr/bin/env node
/**
 * list-labels.js — List all workspace labels.
 *
 * GET /api:bVXsw_FD/web/label_management
 *
 * Usage:
 *   node scripts/list-labels.js
 *   node scripts/list-labels.js --pretty   # human-readable table to stderr
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "labels": [
 *         {
 *           "id": 1,
 *           "label": "Sales",
 *           "keywords": ["buy", "purchase", "pricing"],
 *           "user_id": "uuid",
 *           "created_at": 1700000000000
 *         }
 *       ],
 *       "count": 3
 *     }
 *   }
 *
 * Notes:
 *   - Super Admin and Admin see ALL workspace labels.
 *   - Team Members see only labels assigned to their account.
 *   - Uses chat auth mode (Authorization: <token>, no Bearer prefix).
 *     The same NOTIFYER_API_TOKEN from login.js works for both console
 *     and chat API surfaces.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function printSummary(labels) {
  process.stderr.write(`\nWorkspace Labels (${labels.length} total)\n`);
  process.stderr.write(`${"─".repeat(70)}\n`);
  process.stderr.write(
    `${"ID".padEnd(6)} ${"Label".padEnd(24)} ${"Keywords".padEnd(38)}\n`
  );
  process.stderr.write(`${"─".repeat(70)}\n`);

  for (const l of labels) {
    const id = String(l.id ?? "").padEnd(6);
    const name = (l.label ?? "").slice(0, 23).padEnd(24);
    const kws =
      (l.keywords ?? []).length === 0
        ? "(none)"
        : l.keywords.join(", ").slice(0, 37);
    process.stderr.write(`${id} ${name} ${kws}\n`);
  }

  process.stderr.write("\n");
}

async function main() {
  const flags = parseArgs();
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:bVXsw_FD/web/label_management",
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  const labels = Array.isArray(result.data) ? result.data : [];

  if (pretty) printSummary(labels);

  printJson(ok({ labels, count: labels.length }));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
