#!/usr/bin/env node
/**
 * list-recipients.js — List WhatsApp conversation recipients (contacts).
 *
 * GET /api:bVXsw_FD/web/recipient
 *
 * Usage:
 *   node scripts/list-recipients.js
 *   node scripts/list-recipients.js --page 2
 *   node scripts/list-recipients.js --search "John"
 *   node scripts/list-recipients.js --labels "Support,Billing"
 *   node scripts/list-recipients.js --status unread
 *   node scripts/list-recipients.js --all          # fetch all pages
 *   node scripts/list-recipients.js --pretty
 *
 * Flags:
 *   --page <n>          Page number, 1-based (default: 1). Xano uses 0-based internally.
 *   --per-page <n>      Results per page (default: 20). Match Xano default.
 *   --search <text>     Filter by name or phone number substring.
 *   --labels <csv>      Filter by label names, comma-separated. e.g. "Support,Billing"
 *   --status unread     Only return unread conversations. Omit for all.
 *   --all               Fetch all pages sequentially (up to 1000 recipients).
 *   --pretty            Print human-readable table to stderr.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "recipients": [ { recipient: {...}, conversation: {...} }, ... ],
 *       "count": 20,
 *       "page": 1,
 *       "has_more": true
 *     }
 *   }
 *
 * Recipient fields: id, created_at, user_id, name, phone_number (int),
 *   phone_number_string, country, global_label (string[]), note, note_auto,
 *   is_ai_assistant, ai_bot_id, expiration_timestamp, last_message_time,
 *   recipient_last_message_time.
 *
 * 24h Window: if expiration_timestamp is null or in the past, the contact
 *   can only receive template messages (not free-text). Check before send-text.js.
 *
 * CORS: Xano runs /cors_origin_web_chat.
 *   Script sends Origin: https://chat.notifyer-systems.com automatically.
 *   Override with NOTIFYER_CHAT_ORIGIN env var.
 *
 * Role behaviour: Admin and Super Admin see all recipients.
 *   Team Members only see recipients matching their assigned labels.
 *
 * Auth: Authorization: <token> (raw JWT, no Bearer prefix — chat auth mode).
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

function formatTimestamp(ms) {
  if (!ms) return "N/A";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function printTable(recipients) {
  process.stderr.write(`\nRecipients (${recipients.length} shown)\n`);
  process.stderr.write(`${"─".repeat(110)}\n`);
  process.stderr.write(
    `${"ID".padEnd(6)} ${"Name".padEnd(20)} ${"Phone".padEnd(15)} ${"Labels".padEnd(20)} ${"AI".padEnd(4)} ${"Window".padEnd(8)} ${"Last Msg".padEnd(18)}\n`
  );
  process.stderr.write(`${"─".repeat(110)}\n`);
  for (const row of recipients) {
    const r = row.recipient;
    const id = String(r.id ?? "").padEnd(6);
    const name = (r.name ?? "Unknown").slice(0, 19).padEnd(20);
    const phone = String(r.phone_number_string ?? r.phone_number ?? "").padEnd(15);
    const labels = (r.global_label ?? []).join(",").slice(0, 19).padEnd(20);
    const ai = (r.is_ai_assistant ? "Bot" : "Hum").padEnd(4);
    const now = Date.now();
    const exp = r.expiration_timestamp;
    const window = (!exp || exp < now ? "Tmpl" : "Open").padEnd(8);
    const lastMsg = formatTimestamp(r.last_message_time ?? r.recipient_last_message_time).padEnd(18);
    process.stderr.write(`${id} ${name} ${phone} ${labels} ${ai} ${window} ${lastMsg}\n`);
  }
  process.stderr.write("\n");
}

async function fetchPage(config, params, origin) {
  // Build custom query string matching frontend serializer behaviour:
  // labels[]=A&labels[]=B, or labels=[] for empty, status only if provided
  const parts = [];
  parts.push(`page_number=${params.page_number}`);
  parts.push(`per_page=${params.per_page}`);
  if (params.search) parts.push(`search=${encodeURIComponent(params.search)}`);
  else parts.push(`search=`);

  if (params.labels && params.labels.length > 0) {
    for (const l of params.labels) parts.push(`labels[]=${encodeURIComponent(l)}`);
  } else {
    parts.push(`labels=[]`);
  }

  if (params.status) parts.push(`status=${encodeURIComponent(params.status)}`);
  else parts.push(`status=`);

  return requestJson(config, {
    method: "GET",
    path: `/api:bVXsw_FD/web/recipient?${parts.join("&")}`,
    extraHeaders: { Origin: origin },
  });
}

async function main() {
  const flags = parseArgs();
  const page = getNumberFlag(flags, "page") ?? 1;
  const perPage = getNumberFlag(flags, "per-page") ?? 20;
  const search = getFlag(flags, "search") ?? "";
  const labelsRaw = getFlag(flags, "labels") ?? "";
  const labels = labelsRaw ? labelsRaw.split(",").map((l) => l.trim()).filter(Boolean) : [];
  const status = getFlag(flags, "status") ?? "";
  const fetchAll = getBooleanFlag(flags, "all");
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  if (fetchAll) {
    const allRecipients = [];
    let currentPage = 0;
    const MAX_PAGES = 50;

    while (currentPage < MAX_PAGES) {
      const result = await fetchPage(config, {
        page_number: currentPage,
        per_page: perPage,
        search,
        labels,
        status,
      }, CHAT_ORIGIN);

      if (!result.ok) {
        printJson(err(result.error, result.data, false, result.status));
        return;
      }

      const items = Array.isArray(result.data) ? result.data : [];
      allRecipients.push(...items);
      if (items.length < perPage) break;
      currentPage++;
    }

    if (pretty) printTable(allRecipients);
    printJson(ok({ recipients: allRecipients, count: allRecipients.length, page: "all", has_more: false }));
  } else {
    const result = await fetchPage(config, {
      page_number: page - 1,
      per_page: perPage,
      search,
      labels,
      status,
    }, CHAT_ORIGIN);

    if (!result.ok) {
      printJson(err(result.error, result.data, false, result.status));
      return;
    }

    const items = Array.isArray(result.data) ? result.data : [];
    if (pretty) printTable(items);

    printJson(ok({
      recipients: items,
      count: items.length,
      page,
      has_more: items.length === perPage,
    }));
  }
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
