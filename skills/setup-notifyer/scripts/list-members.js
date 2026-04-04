#!/usr/bin/env node
/**
 * list-members.js — List all team members on the account.
 *
 * GET /api:-4GSCDHb/auth/get_team_member
 *
 * Usage:
 *   node scripts/list-members.js
 *   node scripts/list-members.js --page 1 --per-page 25
 *   node scripts/list-members.js --labels          # also fetch available labels
 *   node scripts/list-members.js --pretty          # human-readable table to stderr
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "items": [
 *         {
 *           "id": "uuid",
 *           "name": "Jane Smith",
 *           "email": "jane@company.com",
 *           "role": "Admin",
 *           "labels": ["Sales", "Support"],
 *           "created_at": "2024-01-15T10:00:00.000Z"
 *         }
 *       ],
 *       "team_seat": { "included_seats": 3 },
 *       "available_labels": [ { "id": "1", "label": "Sales" } ]  // only with --labels
 *     }
 *   }
 *
 * Roles in the system:
 *   Super Admin              — Account owner. Cannot be modified or deleted.
 *   Admin                   — Full access to all labels and features.
 *   Team Member (All Labels) — Inbox access to all labels, limited settings.
 *   Team Member              — Inbox access to assigned labels only.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getNumberFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const ROLE_ORDER = ["Super Admin", "Admin", "Team Member (All Labels)", "Team Member"];

function printSummary(data) {
  const items = data.items ?? [];
  const seat = data.team_seat;

  process.stderr.write(`\nTeam Members (${items.length} total`);
  if (seat) process.stderr.write(`, ${seat.included_seats} seats included`);
  process.stderr.write(")\n");
  process.stderr.write(`${"─".repeat(72)}\n`);
  process.stderr.write(
    `${"Name".padEnd(22)} ${"Email".padEnd(28)} ${"Role".padEnd(28)} Labels\n`
  );
  process.stderr.write(`${"─".repeat(72)}\n`);

  for (const m of items) {
    const name = (m.name ?? "").slice(0, 21).padEnd(22);
    const email = (m.email ?? "").slice(0, 27).padEnd(28);
    const role = (m.role ?? "").slice(0, 27).padEnd(28);
    const labels =
      m.role === "Super Admin" || m.role === "Admin" || m.role === "Team Member (All Labels)"
        ? "All"
        : (m.labels ?? []).join(", ") || "—";
    process.stderr.write(`${name} ${email} ${role} ${labels}\n`);
  }

  if (data.available_labels) {
    process.stderr.write(
      `\nAvailable labels: ${data.available_labels.map((l) => l.label).join(", ")}\n`
    );
  }
  process.stderr.write("\n");
}

async function main() {
  const flags = parseArgs();
  const page = getNumberFlag(flags, "page") ?? 0;
  const perPage = getNumberFlag(flags, "per-page") ?? 25;
  const withLabels = getBooleanFlag(flags, "labels");
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ requireToken: true });

  // Fetch team members
  const membersResult = await requestJson(config, {
    method: "GET",
    path: "/api:-4GSCDHb/auth/get_team_member",
    query: { page, per_page: perPage, offset: page * perPage },
  });

  if (!membersResult.ok) {
    printJson(err(membersResult.error, membersResult.data, false, membersResult.status));
  }

  const output = {
    items: membersResult.data?.items ?? [],
    team_seat: membersResult.data?.team_seat ?? null,
  };

  // Optionally fetch available labels
  if (withLabels) {
    const labelsResult = await requestJson(config, {
      method: "GET",
      path: "/api:eWoClqoZ/role/get_labels",
    });
    output.available_labels = labelsResult.ok
      ? Array.isArray(labelsResult.data) ? labelsResult.data : []
      : [];
  }

  // Sort: Super Admin first, then by role order, then alphabetically
  output.items.sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role);
    const bi = ROLE_ORDER.indexOf(b.role);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  if (pretty) printSummary(output);

  printJson(ok(output));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
