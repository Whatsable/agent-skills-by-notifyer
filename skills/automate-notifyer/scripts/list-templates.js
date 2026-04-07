#!/usr/bin/env node
/**
 * list-templates.js — List all workspace WhatsApp message templates.
 *
 * GET /api:AFRA_QCy/templates_web
 *
 * Usage:
 *   node scripts/list-templates.js
 *   node scripts/list-templates.js --status approved
 *   node scripts/list-templates.js --category MARKETING
 *   node scripts/list-templates.js --type image
 *   node scripts/list-templates.js --pretty
 *
 * Flags:
 *   --status <value>      Filter by status: approved | pending | rejected  (optional)
 *   --category <value>    Filter by category: MARKETING | UTILITY | AUTHENTICATION  (optional)
 *   --type <value>        Filter by template type: text | image | document | video  (optional)
 *   --pretty              Print human-readable table to stderr  (optional)
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "templates": [
 *         {
 *           "id": "abc123",
 *           "name": "order_confirmation",
 *           "template_id": "tmpl_...",
 *           "whatsapp_template_id": 123456789,
 *           "category": "MARKETING",
 *           "type": "text",
 *           "body": "Hello {{1}}, your order #{{2}} is confirmed.",
 *           "language": "en",
 *           "status": "approved",
 *           "components": [...]
 *         }
 *       ],
 *       "count": 5
 *     }
 *   }
 *
 * Notes:
 *   - Returns ALL templates for the workspace (no server-side pagination).
 *   - Status values:
 *       "approved"  — ready to use in broadcasts and chat sends
 *       "pending"   — under Meta review (usually resolves within 45 seconds)
 *       "rejected"  — failed Meta review; cannot be used for sends; must recreate
 *   - SIDE EFFECT: Every call to this endpoint auto-syncs PENDING templates with Meta.
 *     Xano loops over PENDING templates, calls the Meta API for each one to get the
 *     current status, and saves any changes. This means the returned status is always
 *     up-to-date — you do NOT need to poll separately for status changes.
 *   - To get a single template by name or ID use get-template.js.
 *   - For broadcast-ready (approved-only) templates use:
 *       GET /api:AFRA_QCy/templates_broadcast_web
 *     The list-templates.js --status approved flag achieves the same client-side.
 *   - Uses console auth mode (Authorization: Bearer <token>).
 *   - There is also a developer-API variant: GET /api:AFRA_QCy/get_templates (uses raw
 *     api_key auth, same sync behavior). Not wrapped in a script — use list-templates.js.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const STATUS_COLORS = { approved: "✓", pending: "…", rejected: "✗" };

function printSummary(templates) {
  process.stderr.write(`\nWorkspace Templates (${templates.length} total)\n`);
  process.stderr.write(`${"─".repeat(90)}\n`);
  process.stderr.write(
    `${"Name".padEnd(32)} ${"Category".padEnd(16)} ${"Type".padEnd(10)} ${"Lang".padEnd(6)} ${"Status".padEnd(12)}\n`
  );
  process.stderr.write(`${"─".repeat(90)}\n`);

  for (const t of templates) {
    const name = (t.name ?? "").slice(0, 31).padEnd(32);
    const cat = (t.category ?? "").slice(0, 15).padEnd(16);
    const type = (t.type ?? "").slice(0, 9).padEnd(10);
    const lang = (t.language ?? "").slice(0, 5).padEnd(6);
    const status = t.status ?? "";
    const icon = STATUS_COLORS[status.toLowerCase()] ?? "?";
    process.stderr.write(`${name} ${cat} ${type} ${lang} ${icon} ${status}\n`);
  }

  process.stderr.write("\n");
}

async function main() {
  const flags = parseArgs();
  const statusFilter = getFlag(flags, "status")?.toLowerCase();
  const categoryFilter = getFlag(flags, "category")?.toUpperCase();
  const typeFilter = getFlag(flags, "type")?.toLowerCase();
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:AFRA_QCy/templates_web",
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  let templates = Array.isArray(result.data) ? result.data : [];

  if (statusFilter) {
    templates = templates.filter(
      (t) => (t.status ?? "").toLowerCase() === statusFilter
    );
  }
  if (categoryFilter) {
    templates = templates.filter(
      (t) => (t.category ?? "").toUpperCase() === categoryFilter
    );
  }
  if (typeFilter) {
    templates = templates.filter(
      (t) => (t.type ?? "").toLowerCase() === typeFilter
    );
  }

  if (pretty) printSummary(templates);

  printJson(ok({ templates, count: templates.length }));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
