#!/usr/bin/env node
/**
 * list-scheduled.js — List all scheduled messages for this account.
 *
 * GET /api:bVXsw_FD/web/chat_schedule
 *
 * Scheduled messages are created via send-text.js, send-template.js, or
 * send-attachment.js with the --schedule flag. They are stored in Xano's
 * chat_schedule table and sent automatically at the scheduled_time.
 *
 * Usage:
 *   node scripts/list-scheduled.js
 *   node scripts/list-scheduled.js --phone 14155550123
 *   node scripts/list-scheduled.js --pretty
 *
 * Optional Flags:
 *   --phone <number>    Filter by recipient phone number (client-side filter).
 *   --pretty            Print a human-readable table to stderr.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "scheduled": [
 *         {
 *           "id": 7,
 *           "phone_number": 14155550123,
 *           "message_type": "text",
 *           "text": "Hello!",
 *           "scheduled_time": 1706184000000,
 *           "scheduled_time_formatted": "2025-01-25T14:00:00.000Z",
 *           "status": "pending"
 *         },
 *         ...
 *       ],
 *       "count": 3
 *     }
 *   }
 *
 * Scheduled message fields (normalised):
 *   id                  Integer — use this for delete-scheduled.js
 *   phone_number        Integer
 *   message_type        "text" | "template" | "attachment"
 *   text                Content for text messages (null for template/attachment)
 *   template            Template ID for template messages (null otherwise)
 *   url                 URL for attachment messages (null otherwise)
 *   scheduled_time      Unix ms timestamp (integer)
 *   scheduled_time_formatted  ISO 8601 string for readability
 *   status              "pending" | "sent" | "failed"
 *
 * CORS: Xano runs /cors_origin_web_chat on this endpoint.
 *   Script sends Origin: https://chat.notifyer-systems.com.
 *
 * Auth: Authorization: <token> (raw JWT, no Bearer — chat auth mode).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 *   NOTIFYER_CHAT_ORIGIN     optional (default: https://chat.notifyer-systems.com)
 */

import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const CHAT_ORIGIN = process.env.NOTIFYER_CHAT_ORIGIN ?? "https://chat.notifyer-systems.com";

function normalise(item) {
  const scheduledMs = item.scheduled_time ? Number(item.scheduled_time) : null;
  return {
    id: item.id,
    phone_number: item.phone_number,
    message_type: item.message_type ?? (item.text ? "text" : item.template ? "template" : "attachment"),
    text: item.text ?? null,
    template: item.template ?? null,
    variables: item.variables ?? null,
    url: item.url ?? null,
    caption: item.caption ?? null,
    scheduled_time: scheduledMs,
    scheduled_time_formatted: scheduledMs ? new Date(scheduledMs).toISOString() : null,
    status: item.status ?? "pending",
    created_at: item.created_at ?? null,
  };
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:bVXsw_FD/web/chat_schedule",
    extraHeaders: { Origin: CHAT_ORIGIN },
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  let items = Array.isArray(result.data) ? result.data : (result.data?.items ?? []);

  if (phoneRaw) {
    const phone = phoneRaw.replace(/^\+/, "");
    items = items.filter((item) => String(item.phone_number) === phone);
  }

  const normalised = items.map(normalise);

  if (pretty) {
    process.stderr.write(`\nScheduled Messages (${normalised.length})\n`);
    process.stderr.write(`${"─".repeat(90)}\n`);
    for (const msg of normalised) {
      const preview = msg.text?.slice(0, 40) ?? msg.template ?? msg.url?.slice(0, 40) ?? "(no preview)";
      const time = msg.scheduled_time_formatted ?? "unknown";
      process.stderr.write(`[${msg.id}] +${msg.phone_number} — ${msg.message_type} — ${time}\n`);
      process.stderr.write(`       ${preview}\n`);
      process.stderr.write(`       Status: ${msg.status}\n\n`);
    }
  }

  printJson(ok({ scheduled: normalised, count: normalised.length }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
