#!/usr/bin/env node
/**
 * list-bots.js — List all AI bots configured for this Notifyer account.
 *
 * GET /api:Sc_sezER/ai_config
 *
 * This is a convenience script for chat-notifyer that wraps the same
 * endpoint used by automate-notifyer/list-bots.js. It is included here
 * so chat-notifyer users can discover bot IDs without switching to a
 * different skill package.
 *
 * Usage:
 *   node scripts/list-bots.js
 *   node scripts/list-bots.js --pretty
 *
 * Optional Flags:
 *   --pretty    Print a human-readable table to stderr.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "bots": [
 *         {
 *           "id": 5,
 *           "name": "Support Bot",
 *           "model": "gpt-4o",
 *           "temperature": 0.7,
 *           "handoff_label": "Billing",
 *           "status": true
 *         },
 *         ...
 *       ],
 *       "count": 2
 *     }
 *   }
 *
 * Use the "id" field value for --bot-id in assign-bot.js.
 * Use the "handoff_label" to understand which label triggers human handoff.
 *
 * Auth: Authorization: Bearer <token> (console auth mode — different from chat auth).
 *   Note: This endpoint uses the CONSOLE auth mode (Bearer prefix), not chat auth.
 *   Both modes use the same underlying JWT, just different header formats.
 *   The console endpoint is at /api:Sc_sezER/ which requires Bearer prefix.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 */

import { loadConfig, requestJson, AUTH_MODE_CONSOLE } from "./lib/notifyer-api.js";
import { parseArgs, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

async function main() {
  const flags = parseArgs();
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ authMode: AUTH_MODE_CONSOLE, requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:Sc_sezER/ai_config",
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  const bots = Array.isArray(result.data) ? result.data : (result.data?.items ?? []);

  const normalised = bots.map((b) => ({
    id: b.id,
    name: b.name ?? b.bot_name,
    model: b.ai_model ?? b.model,
    temperature: b.temperature,
    handoff_label: b.handoff_label ?? b.human_label,
    status: b.status ?? b.is_active,
    created_at: b.created_at,
  }));

  if (pretty) {
    process.stderr.write(`\nAI Bots (${normalised.length})\n`);
    process.stderr.write(`${"─".repeat(80)}\n`);
    for (const b of normalised) {
      process.stderr.write(`[${b.id}] ${b.name ?? "Unnamed"}\n`);
      process.stderr.write(`  Model:          ${b.model ?? "N/A"}\n`);
      process.stderr.write(`  Temperature:    ${b.temperature ?? "N/A"}\n`);
      process.stderr.write(`  Handoff Label:  ${b.handoff_label ?? "None"}\n`);
      process.stderr.write(`  Active:         ${b.status ? "Yes" : "No"}\n\n`);
    }
  }

  printJson(ok({ bots: normalised, count: normalised.length }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
