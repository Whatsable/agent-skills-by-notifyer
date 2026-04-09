#!/usr/bin/env node
/**
 * set-handoff.js — Control AI bot vs. human agent for a recipient's conversation.
 *
 * PATCH /api:bVXsw_FD/chatapp/recipient/handoff
 *
 * Handoff types in Notifyer:
 *   "bot"   → AI bot handles the conversation (is_ai_assistant = true)
 *   "human" → Human agent handles the conversation (is_ai_assistant = false)
 *
 * This script is the primary mechanism for "Chat Handoff" (Phase 3d).
 * Agents use this to:
 *   - Take over a conversation from the bot: --mode human
 *   - Return the conversation to the bot: --mode bot
 *
 * Usage:
 *   node scripts/set-handoff.js --phone 14155550123 --mode human
 *   node scripts/set-handoff.js --phone 14155550123 --mode bot
 *   node scripts/set-handoff.js --phone 14155550123 --mode human --pretty
 *
 * Required Flags:
 *   --phone <number>    Recipient phone number WITHOUT + prefix (integer).
 *   --mode <mode>       "human" or "bot".
 *
 * Optional Flags:
 *   --pretty            Print handoff summary to stderr.
 *
 * Strategy:
 *   1. GET /auth/me → get user_id (uuid) — required by the Xano endpoint
 *   2. PATCH /chatapp/recipient/handoff → set handoff mode
 *
 * Output (success):
 *   { "ok": true, "data": { "id": 42, "is_ai_assistant": false, ... } }
 *
 * Xano request body:
 *   { phone_number: <int>, user_id: <uuid_string>, handoff: <"bot"|"human"> }
 *
 * Note: This endpoint does NOT require CORS header (no cors_origin_web_chat step).
 *   It IS a public endpoint in Xano but still sends Authorization for consistency.
 *
 * Side effects (confirmed from Xano screenshots):
 *   - Updates recipient.is_ai_assistant field
 *   - May trigger webhook event if outgoing webhooks configured
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
  const mode = getFlag(flags, "mode");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required. Provide phone number without + prefix (e.g. 14155550123)."));
    return;
  }
  if (!mode || !["human", "bot"].includes(mode)) {
    printJson(err('--mode is required. Must be "human" or "bot".'));
    return;
  }

  const phone = parseInt(phoneRaw.replace(/^\+/, ""), 10);
  if (isNaN(phone)) {
    printJson(err("--phone must be a valid integer phone number."));
    return;
  }

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  const userId = await getUserId(config);
  if (!userId) {
    printJson(err("Could not resolve user_id from auth token. Ensure NOTIFYER_API_TOKEN is valid."));
    return;
  }

  if (pretty) {
    process.stderr.write(`\nSetting conversation handoff for +${phone} → ${mode.toUpperCase()}\n`);
  }

  const result = await requestJson(config, {
    method: "PATCH",
    path: "/api:bVXsw_FD/chatapp/recipient/handoff",
    body: {
      phone_number: phone,
      user_id: userId,
      handoff: mode,
    },
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  const d = result.data;

  if (pretty) {
    process.stderr.write(`  is_ai_assistant: ${d?.is_ai_assistant ?? "unknown"}\n`);
    process.stderr.write(`  Mode: ${mode === "bot" ? "AI Bot is handling conversation" : "Human agent is handling conversation"}\n\n`);
  }

  printJson(ok(d));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
