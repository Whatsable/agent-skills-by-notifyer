#!/usr/bin/env node
/**
 * list-bots.js — List all AI bots configured in the workspace.
 *
 * GET /api:Sc_sezER/ai_config
 *
 * Usage:
 *   node scripts/list-bots.js
 *   node scripts/list-bots.js --default-only
 *   node scripts/list-bots.js --pretty
 *
 * Flags:
 *   --default-only   Return only the bot currently marked as default  (optional)
 *   --pretty         Print human-readable table to stderr  (optional)
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "bots": [
 *         {
 *           "id": 12,
 *           "bot_name": "Support Bot",
 *           "mission": "Help users resolve issues",
 *           "tone": "Friendly",
 *           "delay": 3,
 *           "default": true,
 *           "notification": true,
 *           "human_trigger_keywords": ["agent", "human", "help"],
 *           "handoff_instruction": "I'll connect you with a human.",
 *           "knowledge_base": "...",
 *           "system_prompt": "...",
 *           "openai_assistant_id": "asst_...",
 *           "files_metadatas": [],
 *           "file_texts": {},
 *           "user_id": "uuid...",
 *           "created_at": "2024-01-01T00:00:00.000Z"
 *         }
 *       ],
 *       "count": 1
 *     }
 *   }
 *
 * Output (no bots):
 *   { "ok": true, "data": { "bots": [], "count": 0 } }
 *
 * Notes:
 *   - Returns ALL bots for the workspace (not filtered by calling user).
 *   - Bots are sorted: default bot first, then newest first.
 *   - The `openai_assistant_id` field is present in the response; treat it as internal.
 *   - `knowledge_base` and `file_texts` may be large strings — omit them if only listing.
 *   - Requires Pro or Agency plan to create bots, but list always returns existing bots.
 *   - Uses console auth mode (Authorization: Bearer <token>).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function printSummary(bots) {
  process.stderr.write(`\nWorkspace AI Bots (${bots.length} total)\n`);
  process.stderr.write(`${"─".repeat(90)}\n`);
  process.stderr.write(
    `${"ID".padEnd(6)} ${"Name".padEnd(28)} ${"Tone".padEnd(14)} ${"Delay".padEnd(7)} ${"Default".padEnd(9)} ${"Notif".padEnd(7)} Keywords\n`
  );
  process.stderr.write(`${"─".repeat(90)}\n`);

  for (const b of bots) {
    const id = String(b.id ?? "").padEnd(6);
    const name = (b.bot_name ?? "").slice(0, 27).padEnd(28);
    const tone = (b.tone ?? "—").slice(0, 13).padEnd(14);
    const delay = String(b.delay ?? 0).padEnd(7);
    const def = (b.default ? "✓ YES" : "NO").padEnd(9);
    const notif = (b.notification ? "ON" : "off").padEnd(7);
    const keywords = Array.isArray(b.human_trigger_keywords)
      ? b.human_trigger_keywords.slice(0, 4).join(", ")
      : "—";
    process.stderr.write(`${id} ${name} ${tone} ${delay} ${def} ${notif} ${keywords}\n`);
  }

  process.stderr.write("\n");
}

async function main() {
  const flags = parseArgs();
  const defaultOnly = getBooleanFlag(flags, "default-only");
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:Sc_sezER/ai_config",
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  let bots = Array.isArray(result.data) ? result.data : [];

  if (defaultOnly) {
    bots = bots.filter((b) => b.default === true);
  }

  // Sort: default bot first, then newest first
  bots.sort((a, b) => {
    if (a.default && !b.default) return -1;
    if (!a.default && b.default) return 1;
    return new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0);
  });

  if (pretty) printSummary(bots);

  printJson(ok({ bots, count: bots.length }));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
