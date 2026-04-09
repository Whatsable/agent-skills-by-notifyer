#!/usr/bin/env node
/**
 * get-recipient.js — Get a single recipient by phone number.
 *
 * GET /api:bVXsw_FD/chatapp/recipient?phone_number=<int>&user_id=<uuid>
 *
 * Strategy: calls GET /auth/me first to get the user_id (uuid) required
 * by this endpoint, then fetches the recipient.
 *
 * Usage:
 *   node scripts/get-recipient.js --phone 14155550123
 *   node scripts/get-recipient.js --phone 14155550123 --pretty
 *
 * Flags:
 *   --phone <number>    Phone number WITHOUT + prefix (integer, e.g. 14155550123)
 *   --pretty            Print human-readable summary to stderr
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 42,
 *       "name": "John Doe",
 *       "phone_number": 14155550123,
 *       "phone_number_string": "+14155550123",
 *       "global_label": ["Support"],
 *       "note": "VIP customer",
 *       "note_auto": "Wants refund for order #123",
 *       "is_ai_assistant": false,
 *       "ai_bot_id": null,
 *       "expiration_timestamp": 1706184000000,
 *       ...
 *     }
 *   }
 *
 * Returns { ok: false, error: "Recipient not found" } if no match.
 *
 * 24h Window: check expiration_timestamp.
 *   - null or past → template-only contact (use send-template.js)
 *   - future → open window (can use send-text.js)
 *
 * Endpoint: PUBLIC in Xano (no auth badge) but sends Authorization header anyway.
 * No CORS header required for /chatapp/ endpoints.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 */

import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

async function getUserId(config) {
  const result = await requestJson(config, {
    method: "GET",
    path: "/api:-4GSCDHb/auth/me",
  });
  if (!result.ok) return null;
  return result.data?.user_id ?? result.data?.id ?? null;
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required. Provide the phone number without + prefix (e.g. 14155550123)."));
    return;
  }

  const phone = parseInt(phoneRaw.replace(/^\+/, ""), 10);
  if (isNaN(phone)) {
    printJson(err("--phone must be a valid integer phone number (no + prefix)."));
    return;
  }

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  const userId = await getUserId(config);
  if (!userId) {
    printJson(err("Could not resolve user_id from auth token. Ensure NOTIFYER_API_TOKEN is valid."));
    return;
  }

  const result = await requestJson(config, {
    method: "GET",
    path: `/api:bVXsw_FD/chatapp/recipient?phone_number=${phone}&user_id=${userId}`,
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  const data = Array.isArray(result.data) ? result.data[0] : result.data;

  if (!data || (Array.isArray(result.data) && result.data.length === 0)) {
    printJson(err(`Recipient with phone ${phone} not found.`, null, false));
    return;
  }

  if (pretty) {
    const now = Date.now();
    const exp = data.expiration_timestamp;
    const windowOpen = exp && exp > now;
    process.stderr.write(`\nRecipient: ${data.name ?? "Unknown"}\n`);
    process.stderr.write(`  ID:              ${data.id}\n`);
    process.stderr.write(`  Phone:           ${data.phone_number_string ?? data.phone_number}\n`);
    process.stderr.write(`  Labels:          ${(data.global_label ?? []).join(", ") || "None"}\n`);
    process.stderr.write(`  Note:            ${data.note || "(none)"}\n`);
    process.stderr.write(`  AI Note:         ${data.note_auto || "(none)"}\n`);
    process.stderr.write(`  AI Assistant:    ${data.is_ai_assistant ? "Yes (Bot)" : "No (Human)"}\n`);
    process.stderr.write(`  AI Bot ID:       ${data.ai_bot_id ?? "None"}\n`);
    process.stderr.write(`  24h Window:      ${windowOpen ? "OPEN (can send text)" : "CLOSED (template only)"}\n`);
    process.stderr.write("\n");
  }

  printJson(ok(data));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
