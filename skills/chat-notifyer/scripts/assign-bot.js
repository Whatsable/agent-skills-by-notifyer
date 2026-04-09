#!/usr/bin/env node
/**
 * assign-bot.js — Assign an AI bot to a recipient's conversation.
 *
 * Strategy (fetch-then-patch):
 *   1. GET /api:bVXsw_FD/web/recipient?search=<phone> → find recipient ID
 *   2. PATCH /api:bVXsw_FD/web/recipient/:id { ai_bot_id: <id>, is_ai_assistant: true }
 *
 * This assigns a specific AI bot to handle the recipient's conversation AND
 * enables the AI assistant mode simultaneously.
 *
 * To just toggle AI mode without changing bot, use set-handoff.js instead.
 * To list available bots, use list-bots.js.
 *
 * Usage:
 *   node scripts/assign-bot.js --phone 14155550123 --bot-id 5
 *   node scripts/assign-bot.js --phone 14155550123 --bot-id 5 --pretty
 *   node scripts/assign-bot.js --phone 14155550123 --bot-id 5 --no-activate
 *
 * Required Flags:
 *   --phone <number>    Recipient phone number WITHOUT + prefix (integer).
 *   --bot-id <id>       AI bot ID (integer, from list-bots.js).
 *
 * Optional Flags:
 *   --no-activate       Assign bot without enabling AI mode (just sets ai_bot_id).
 *                       Default: enables AI mode when assigning a bot.
 *   --pretty            Print assignment summary to stderr.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 42,
 *       "ai_bot_id": 5,
 *       "is_ai_assistant": true
 *     }
 *   }
 *
 * CORS: Xano runs /cors_origin_web_chat on PATCH /web/recipient/:id.
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
import { parseArgs, getFlag, getBooleanFlag, getNumberFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const CHAT_ORIGIN = process.env.NOTIFYER_CHAT_ORIGIN ?? "https://chat.notifyer-systems.com";

async function findRecipient(config, phone) {
  const parts = [
    `page_number=0`,
    `per_page=20`,
    `search=${encodeURIComponent(String(phone))}`,
    `labels=[]`,
    `status=`,
  ];
  const result = await requestJson(config, {
    method: "GET",
    path: `/api:bVXsw_FD/web/recipient?${parts.join("&")}`,
    extraHeaders: { Origin: CHAT_ORIGIN },
  });
  if (!result.ok) return result;
  const items = Array.isArray(result.data) ? result.data : [];
  const match = items.find((row) => {
    const r = row.recipient ?? row;
    return String(r.phone_number) === String(phone) ||
      String(r.phone_number_string ?? "").replace(/\D/g, "") === String(phone).replace(/\D/g, "");
  });
  if (!match) return { ok: false, error: `Recipient with phone ${phone} not found.` };
  return { ok: true, data: match.recipient ?? match };
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const botIdRaw = getNumberFlag(flags, "bot-id");
  const noActivate = getBooleanFlag(flags, "no-activate");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required."));
    return;
  }
  if (botIdRaw === null || botIdRaw === undefined) {
    printJson(err("--bot-id is required. Provide the AI bot ID (integer) from list-bots.js."));
    return;
  }

  const phone = phoneRaw.replace(/^\+/, "");
  const botId = Number(botIdRaw);

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  const findResult = await findRecipient(config, phone);
  if (!findResult.ok) {
    printJson(err(findResult.error, findResult.data, false, findResult.status));
    return;
  }

  const recipient = findResult.data;

  if (pretty) {
    process.stderr.write(`\nAssigning bot ID ${botId} to ${recipient.name ?? recipient.phone_number}\n`);
    process.stderr.write(`  Current bot: ${recipient.ai_bot_id ?? "None"}\n`);
    process.stderr.write(`  AI mode: ${recipient.is_ai_assistant ? "On" : "Off"} → ${noActivate ? "unchanged" : "On"}\n\n`);
  }

  const patchFields = {
    ai_bot_id: botId,
    ...(noActivate ? {} : { is_ai_assistant: true }),
  };

  const patchResult = await requestJson(config, {
    method: "PATCH",
    path: `/api:bVXsw_FD/web/recipient/${recipient.id}`,
    body: patchFields,
    extraHeaders: { Origin: CHAT_ORIGIN },
  });

  if (!patchResult.ok) {
    printJson(err(patchResult.error, patchResult.data, false, patchResult.status));
    return;
  }

  const d = patchResult.data;
  printJson(ok({
    id: recipient.id,
    ai_bot_id: d?.ai_bot_id ?? botId,
    is_ai_assistant: d?.is_ai_assistant ?? !noActivate,
  }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
