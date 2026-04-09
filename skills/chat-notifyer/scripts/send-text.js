#!/usr/bin/env node
/**
 * send-text.js — Send a free-text WhatsApp message to a recipient.
 *
 * POST /api:bVXsw_FD/web/send/text
 *
 * Usage:
 *   node scripts/send-text.js --phone 14155550123 --text "Hello!"
 *   node scripts/send-text.js --phone 14155550123 --text "Your order is ready." --schedule "25/01/2025 14:00"
 *
 * Required Flags:
 *   --phone <number>    Recipient phone number WITHOUT + prefix (integer).
 *   --text <message>    The message to send (plain text).
 *
 * Optional Flags:
 *   --schedule <time>   Schedule the message. Format: "DD/MM/YYYY HH:mm"
 *                       When set, Xano saves to chat_schedule table — no immediate send.
 *   --pretty            Print summary to stderr.
 *
 * Output (immediate send — success):
 *   { "ok": true, "data": { "success": true, ... response_data_structure } }
 *
 * Output (scheduled):
 *   { "ok": true, "data": { "scheduled": true, "scheduled_time": <ms>, ... } }
 *
 * CRITICAL — 24h Window Rule:
 *   WhatsApp only allows free-text messages within 24 hours of the recipient's
 *   last message. If the window is closed (expiration_timestamp null or past),
 *   the API will fail. Use send-template.js instead.
 *   Check the window with: node scripts/get-recipient.js --phone <number> --pretty
 *
 * Inputs Xano expects (confirmed from Xano screenshot):
 *   - phone_number: integer (not string)
 *   - text: text
 *   - scheduled_time: integer (Unix ms) — omit entirely for immediate send
 *   - currentRecipient: json (full recipient object, optional but send if available)
 *   No CORS header required for this endpoint (confirmed: no cors_origin_web_chat step).
 *
 * Scheduling format: "DD/MM/YYYY HH:mm" — Xano stores timezone from IP lookup.
 *   The script converts this to Unix ms timestamp (integer) before sending.
 *
 * Auth: Authorization: <token> (raw JWT, no Bearer — chat auth mode).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 */

import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function parseDateDDMMYYYY(str) {
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00`);
  return isNaN(d.getTime()) ? null : d.getTime();
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const text = getFlag(flags, "text");
  const scheduleStr = getFlag(flags, "schedule");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required. Provide phone number without + prefix (e.g. 14155550123)."));
    return;
  }
  if (!text) {
    printJson(err("--text is required. Provide the message to send."));
    return;
  }

  const phone = parseInt(phoneRaw.replace(/^\+/, ""), 10);
  if (isNaN(phone)) {
    printJson(err("--phone must be a valid integer phone number."));
    return;
  }

  let scheduledTime = undefined;
  if (scheduleStr) {
    scheduledTime = parseDateDDMMYYYY(scheduleStr);
    if (!scheduledTime) {
      printJson(err(`Invalid --schedule format. Use "DD/MM/YYYY HH:mm" (e.g. "25/01/2025 14:00").`));
      return;
    }
  }

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  const body = {
    text,
    phone_number: phone,
    ...(scheduledTime !== undefined ? { scheduled_time: scheduledTime } : {}),
  };

  const result = await requestJson(config, {
    method: "POST",
    path: "/api:bVXsw_FD/web/send/text",
    body,
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  if (pretty) {
    if (scheduledTime) {
      process.stderr.write(`\nMessage scheduled for ${scheduleStr} (${scheduledTime}ms)\n`);
      process.stderr.write(`  To: +${phone}\n`);
      process.stderr.write(`  Text: "${text}"\n\n`);
    } else {
      const d = result.data;
      process.stderr.write(`\nMessage sent!\n`);
      process.stderr.write(`  To: +${phone}\n`);
      process.stderr.write(`  Text: "${text}"\n`);
      process.stderr.write(`  Success: ${d?.success ?? "unknown"}\n\n`);
    }
  }

  printJson(ok(result.data));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
