#!/usr/bin/env node
/**
 * filter-recipients-by-label.js — List recipients filtered by one or more labels.
 *
 * GET /api:bVXsw_FD/web/recipient (with labels[] filter)
 *
 * Thin wrapper around list-recipients.js with --labels required.
 * Labels are the global_label names created in setup-notifyer (create-label.js).
 *
 * Usage:
 *   node scripts/filter-recipients-by-label.js --labels "Support"
 *   node scripts/filter-recipients-by-label.js --labels "Support,Billing"
 *   node scripts/filter-recipients-by-label.js --labels "VIP" --status unread
 *   node scripts/filter-recipients-by-label.js --labels "Support" --all --pretty
 *
 * Flags:
 *   --labels <csv>      Required. Label names to filter by, comma-separated.
 *                       Must match labels created via setup-notifyer/create-label.js.
 *   --status unread     Only return unread conversations.
 *   --page <n>          Page number, 1-based (default: 1).
 *   --per-page <n>      Results per page (default: 20).
 *   --all               Fetch all pages sequentially (up to 1000 recipients).
 *   --pretty            Print human-readable table to stderr.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "labels": ["Support"],
 *       "recipients": [...],
 *       "count": 5,
 *       "page": 1,
 *       "has_more": false
 *     }
 *   }
 *
 * Note on role behaviour:
 *   - Team Members are automatically restricted to their assigned labels server-side.
 *     Filtering here is an additional client-side label selection on top of that.
 *   - Admin/Super Admin can filter any label across all recipients.
 *
 * CORS: Script sends Origin: https://chat.notifyer-systems.com automatically.
 *   Override with NOTIFYER_CHAT_ORIGIN env var.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 *   NOTIFYER_CHAT_ORIGIN     optional (default: https://chat.notifyer-systems.com)
 */

import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag, getNumberFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const CHAT_ORIGIN = process.env.NOTIFYER_CHAT_ORIGIN ?? "https://chat.notifyer-systems.com";

async function fetchPage(config, params) {
  const parts = [];
  parts.push(`page_number=${params.page_number}`);
  parts.push(`per_page=${params.per_page}`);
  parts.push(`search=`);
  for (const l of params.labels) parts.push(`labels[]=${encodeURIComponent(l)}`);
  if (params.status) parts.push(`status=${encodeURIComponent(params.status)}`);
  else parts.push(`status=`);

  return requestJson(config, {
    method: "GET",
    path: `/api:bVXsw_FD/web/recipient?${parts.join("&")}`,
    extraHeaders: { Origin: CHAT_ORIGIN },
  });
}

async function main() {
  const flags = parseArgs();
  const labelsRaw = getFlag(flags, "labels");
  const status = getFlag(flags, "status") ?? "";
  const page = getNumberFlag(flags, "page") ?? 1;
  const perPage = getNumberFlag(flags, "per-page") ?? 20;
  const fetchAll = getBooleanFlag(flags, "all");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!labelsRaw) {
    printJson(err("--labels is required. Provide comma-separated label names (e.g. --labels \"Support,Billing\")."));
    return;
  }

  const labels = labelsRaw.split(",").map((l) => l.trim()).filter(Boolean);
  if (labels.length === 0) {
    printJson(err("--labels must contain at least one non-empty label name."));
    return;
  }

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  if (fetchAll) {
    const allRecipients = [];
    let currentPage = 0;
    const MAX_PAGES = 50;

    while (currentPage < MAX_PAGES) {
      const result = await fetchPage(config, { page_number: currentPage, per_page: perPage, labels, status });
      if (!result.ok) {
        printJson(err(result.error, result.data, false, result.status));
        return;
      }
      const items = Array.isArray(result.data) ? result.data : [];
      allRecipients.push(...items);
      if (items.length < perPage) break;
      currentPage++;
    }

    if (pretty) {
      process.stderr.write(`\nRecipients with label(s) [${labels.join(", ")}]: ${allRecipients.length} total\n\n`);
    }
    printJson(ok({ labels, recipients: allRecipients, count: allRecipients.length, page: "all", has_more: false }));
  } else {
    const result = await fetchPage(config, { page_number: page - 1, per_page: perPage, labels, status });

    if (!result.ok) {
      printJson(err(result.error, result.data, false, result.status));
      return;
    }

    const items = Array.isArray(result.data) ? result.data : [];

    if (pretty) {
      process.stderr.write(`\nRecipients with label(s) [${labels.join(", ")}]: ${items.length} on page ${page}\n\n`);
      for (const row of items) {
        const r = row.recipient;
        process.stderr.write(`  [${r.id}] ${r.name ?? "Unknown"} — ${r.phone_number_string ?? r.phone_number} — ${(r.global_label ?? []).join(",")}\n`);
      }
      process.stderr.write("\n");
    }

    printJson(ok({ labels, recipients: items, count: items.length, page, has_more: items.length === perPage }));
  }
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
