#!/usr/bin/env node
/**
 * get-conversation-log.js — Read the message history for a specific conversation.
 *
 * GET /api:ereqLKj6/log?phone_number=<int>
 *
 * Returns all messages logged by Notifyer for the given phone number.
 * Useful for understanding conversation context before responding or
 * deciding whether to hand off to a human agent.
 *
 * IMPORTANT — What this log covers:
 *   ✅ Template messages sent via chat or automation
 *   ✅ Text/attachment messages sent via chat
 *   ✅ Broadcast messages sent to this contact
 *   ❌ Inbound messages from the customer (not captured in this log)
 *
 * For full two-way conversation history, open chat.notifyer-systems.com.
 *
 * Usage:
 *   node scripts/get-conversation-log.js --phone 14155550123
 *   node scripts/get-conversation-log.js --phone 14155550123 --page 2
 *   node scripts/get-conversation-log.js --phone 14155550123 --per-page 50 --pretty
 *   node scripts/get-conversation-log.js --phone 14155550123 --all --pretty
 *
 * Required Flags:
 *   --phone <number>    Phone number WITHOUT + prefix (integer). Required.
 *
 * Optional Flags:
 *   --page <n>          Page number, 1-based (default: 1). Client-side pagination.
 *   --per-page <n>      Items per page (default: 20).
 *   --all               Return all messages for this number (no pagination).
 *   --pretty            Print a human-readable conversation timeline to stderr.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "phone_number": 14155550123,
 *       "logs": [
 *         {
 *           "body": "Hello! Your order #12345 has shipped.",
 *           "phone_number": "14155550123",
 *           "status": "read",
 *           "created_at": 1706184000000,
 *           "created_at_formatted": "2025-01-25T14:00:00.000Z"
 *         }
 *       ],
 *       "count": 10,
 *       "total": 10,
 *       "page": 1,
 *       "per_page": 20
 *     }
 *   }
 *
 * Log fields:
 *   body          Message content (text or template body rendered)
 *   phone_number  Recipient phone (string, as returned by Xano)
 *   status        "sent" | "delivered" | "read"
 *   created_at    Unix ms timestamp
 *
 * Note on auth: This endpoint is in the console API group (/api:ereqLKj6)
 *   and requires Bearer auth + console CORS origin. The same JWT token
 *   stored in NOTIFYER_API_TOKEN works — just with "Bearer" prefix.
 *   The script handles this internally.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 */

import { loadConfig, requestJson, AUTH_MODE_CONSOLE } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag, getNumberFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const CONSOLE_ORIGIN = "https://console.notifyer-systems.com";

function formatTimestamp(ms) {
  if (!ms) return "N/A";
  return new Date(Number(ms)).toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const page = getNumberFlag(flags, "page") ?? 1;
  const perPage = getNumberFlag(flags, "per-page") ?? 20;
  const fetchAll = getBooleanFlag(flags, "all");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required. Provide the phone number without + prefix (e.g. 14155550123)."));
    return;
  }

  const phone = parseInt(phoneRaw.replace(/^\+/, ""), 10);
  if (isNaN(phone)) {
    printJson(err("--phone must be a valid integer phone number."));
    return;
  }

  const config = loadConfig({ authMode: AUTH_MODE_CONSOLE, requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:ereqLKj6/log",
    query: { phone_number: phone, filter: "" },
    extraHeaders: { Origin: CONSOLE_ORIGIN },
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  const allLogs = Array.isArray(result.data) ? result.data : [];
  const total = allLogs.length;

  const normalised = allLogs.map((log) => ({
    ...log,
    created_at_formatted: log.created_at ? new Date(Number(log.created_at)).toISOString() : null,
  }));

  let pageLogs;
  if (fetchAll) {
    pageLogs = normalised;
  } else {
    const startIdx = (page - 1) * perPage;
    pageLogs = normalised.slice(startIdx, startIdx + perPage);
  }

  if (pretty) {
    const label = fetchAll ? `all ${total}` : `${pageLogs.length} of ${total} (page ${page})`;
    process.stderr.write(`\nConversation log for +${phone} — ${label} messages\n`);
    process.stderr.write(`${"─".repeat(90)}\n`);
    for (const log of pageLogs) {
      const status = (log.status ?? "sent").toUpperCase().padEnd(9);
      const dt = formatTimestamp(log.created_at);
      const body = (log.body ?? "").replace(/\n/g, " ").slice(0, 60);
      process.stderr.write(`[${status}] ${dt}  ${body}\n`);
    }
    process.stderr.write(`\nNote: Only outbound messages are shown. Inbound messages are visible in chat.notifyer-systems.com\n\n`);
  }

  printJson(ok({
    phone_number: phone,
    logs: pageLogs,
    count: pageLogs.length,
    total,
    page: fetchAll ? "all" : page,
    per_page: fetchAll ? null : perPage,
  }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
