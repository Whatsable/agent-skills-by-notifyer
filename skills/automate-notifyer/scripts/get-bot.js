#!/usr/bin/env node
/**
 * get-bot.js — Retrieve a single AI bot by its numeric ID.
 *
 * GET /api:Sc_sezER/ai_config/:id
 *
 * Usage:
 *   node scripts/get-bot.js --id 12
 *   node scripts/get-bot.js --id 12 --pretty
 *
 * Flags:
 *   --id <integer>   Notifyer bot ID (required)
 *   --pretty         Print human-readable summary to stderr  (optional)
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 12,
 *       "bot_name": "Support Bot",
 *       "mission": "Help users resolve support issues quickly.",
 *       "system_prompt": "You are a helpful support agent...",
 *       "knowledge_base": "Our return policy is...",
 *       "tone": "Friendly",
 *       "delay": 3,
 *       "default": true,
 *       "notification": true,
 *       "human_trigger_keywords": ["agent", "human", "help"],
 *       "handoff_instruction": "I'll connect you with a human agent now.",
 *       "openai_assistant_id": "asst_abc123",
 *       "files_metadatas": [],
 *       "file_texts": {},
 *       "user_id": "uuid...",
 *       "created_at": "2024-01-01T00:00:00.000Z"
 *     }
 *   }
 *
 * Output (not found):
 *   { "ok": false, "error": "Bot with id 99 not found.", "status": 400 }
 *
 * Notes:
 *   - The `id` must be an integer — it maps to the `ai_config_id` path parameter.
 *   - Xano returns HTTP 400 "Precondition Failed" if no record exists for the given ID.
 *     The script surfaces this as a user-friendly "not found" error.
 *   - Does NOT filter by calling user — any authenticated user can look up any bot
 *     by ID in the workspace.
 *   - To find a bot by name use list-bots.js and filter client-side.
 *   - Uses console auth mode (Authorization: Bearer <token>).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function printSummary(bot) {
  const keywords = Array.isArray(bot.human_trigger_keywords)
    ? bot.human_trigger_keywords.join(", ") || "—"
    : "—";

  process.stderr.write(`\nAI Bot #${bot.id}\n`);
  process.stderr.write(`${"─".repeat(60)}\n`);
  process.stderr.write(`  Name         : ${bot.bot_name ?? "—"}\n`);
  process.stderr.write(`  Mission      : ${(bot.mission ?? "—").slice(0, 80)}\n`);
  process.stderr.write(`  Tone         : ${bot.tone ?? "—"}\n`);
  process.stderr.write(`  Delay        : ${bot.delay ?? 0}s\n`);
  process.stderr.write(`  Default      : ${bot.default ? "YES" : "NO"}\n`);
  process.stderr.write(`  Notification : ${bot.notification ? "ON" : "OFF"}\n`);
  process.stderr.write(`  Trigger kws  : ${keywords}\n`);
  process.stderr.write(
    `  Files        : ${Array.isArray(bot.files_metadatas) ? bot.files_metadatas.length : 0} file(s)\n`
  );
  process.stderr.write(`  OpenAI ID    : ${bot.openai_assistant_id ?? "—"}\n`);
  process.stderr.write(`  Created      : ${bot.created_at ?? "—"}\n`);
  process.stderr.write("\n");
}

async function main() {
  const flags = parseArgs();
  const idRaw = getFlag(flags, "id");
  const pretty = flags["pretty"] === true || flags["pretty"] === "";

  if (!idRaw) {
    printJson(err("--id <integer> is required. Example: node scripts/get-bot.js --id 12"));
    return;
  }

  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    printJson(err(`--id must be a positive integer, got: ${idRaw}`));
    return;
  }

  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: `/api:Sc_sezER/ai_config/${id}`,
  });

  if (!result.ok) {
    // Xano fires Precondition (400) when the record is null → treat as not found
    if (result.status === 400) {
      printJson(err(`Bot with id ${id} not found.`, result.data, false, 400));
    } else {
      printJson(err(result.error, result.data, false, result.status));
    }
    return;
  }

  const bot = result.data;

  if (pretty) printSummary(bot);

  printJson(ok(bot));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
