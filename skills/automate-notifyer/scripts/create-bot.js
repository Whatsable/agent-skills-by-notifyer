#!/usr/bin/env node
/**
 * create-bot.js — Create a new AI bot in the Notifyer workspace.
 *
 * POST /api:Sc_sezER/ai_config
 *
 * Usage:
 *   # Minimal — name only
 *   node scripts/create-bot.js --name "Support Bot"
 *
 *   # Full bot configuration
 *   node scripts/create-bot.js \
 *     --name "Support Bot" \
 *     --mission "Help users resolve support issues quickly and accurately." \
 *     --knowledge-base "Our return policy is 30 days. Shipping takes 3-5 business days." \
 *     --system-prompt "You are a friendly support agent. Be concise and helpful." \
 *     --tone "Friendly" \
 *     --delay 3 \
 *     --handoff-instruction "I'll connect you with a human agent now." \
 *     --trigger-keywords "agent,human,speak to person" \
 *     --notification \
 *     --default
 *
 * Flags:
 *   --name <text>               Bot name  (required)
 *   --mission <text>            What the bot's purpose is  (optional)
 *   --knowledge-base <text>     Plain-text knowledge the bot uses to answer questions  (optional)
 *   --system-prompt <text>      System-level instructions for the OpenAI assistant  (optional)
 *   --tone <text>               Tone/personality: e.g. "Friendly", "Professional", "Casual"  (optional)
 *   --delay <integer>           Seconds to wait before sending each reply (default: 0)  (optional)
 *   --handoff-instruction <text>  Message sent to user when human handoff is triggered  (optional)
 *   --trigger-keywords <csv>    Comma-separated keywords that trigger human handoff  (optional)
 *   --notification              Enable human-handoff notification alerts  (optional, default false)
 *   --default                   Mark this bot as the workspace default immediately  (optional, default false)
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 12,
 *       "bot_name": "Support Bot",
 *       "mission": "Help users resolve support issues quickly.",
 *       "tone": "Friendly",
 *       "delay": 3,
 *       "default": false,
 *       "notification": true,
 *       "openai_assistant_id": "asst_abc123",
 *       "human_trigger_keywords": ["agent", "human"],
 *       "handoff_instruction": "I'll connect you with a human agent now.",
 *       "knowledge_base": "Our return policy is 30 days...",
 *       "system_prompt": "You are a friendly support agent...",
 *       "files_metadatas": [],
 *       "file_texts": {},
 *       "user_id": "uuid...",
 *       "created_at": "2024-01-01T00:00:00.000Z"
 *     }
 *   }
 *
 * Output (OpenAI failure — creation blocked):
 *   {
 *     "ok": false,
 *     "error": "Failed to create the OpenAI assistant. The bot was not saved. Check your workspace's OpenAI API key in Notifyer settings.",
 *     "blocked": true,
 *     "data": { ... }
 *   }
 *
 * CRITICAL — HOW BOT CREATION WORKS:
 *   Xano's POST /ai_config function stack does the following in order:
 *     1. Authenticate the calling user (/get_user)
 *     2. Run a Lambda function to build a modified system prompt
 *        (merges mission + knowledge_base + system_prompt)
 *     3. Call OpenAI API: POST https://api.openai.com/v1/assistants
 *        (creates an OpenAI Assistant using your workspace's OpenAI key)
 *     4a. If OpenAI returns status != 200:
 *         - Logs the error to team_creation_log
 *         - Returns the log record (HTTP 200, but NOT a bot_config record)
 *     4b. If OpenAI returns status == 200:
 *         - Logs the event to team_creation_log
 *         - Saves the bot_config record
 *         - Returns the bot_config record
 *
 *   Both success and failure return HTTP 200. The script detects failure by checking
 *   whether the response contains a `bot_name` field (bot_config → success) or not
 *   (team_creation_log → OpenAI failure).
 *
 * Notes:
 *   - Requires Pro or Agency subscription plan. On Basic plan, the OpenAI call will
 *     fail because no OpenAI key is configured in the workspace.
 *   - Multiple bots CAN share the same name — there is no duplicate name check.
 *   - File-based knowledge base (PDF, DOCX, CSV) requires a separate upload workflow:
 *       1. Upload file: POST /api:Sc_sezER/ai_config/files (multipart form, 10MB limit)
 *       2. Extract text client-side (or via /api/extract-pdf, /api/extract-docx)
 *       3. Include files_metadatas and file_texts in the create payload
 *     This is not supported in this script. Use --knowledge-base for text input instead.
 *   - To set a bot as the workspace default AFTER creation, use:
 *       PATCH /api:Sc_sezER/ai_config/set-as-default/:id
 *     (requires Super Admin or Admin role)
 *   - Uses console auth mode (Authorization: Bearer <token>).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js, must be Super Admin or Admin)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

async function main() {
  const flags = parseArgs();

  const name = getFlag(flags, "name");
  if (!name || !name.trim()) {
    printJson(err("--name <text> is required. Example: node scripts/create-bot.js --name \"Support Bot\""));
    return;
  }

  const mission = getFlag(flags, "mission") ?? "";
  const knowledgeBase = getFlag(flags, "knowledge-base") ?? "";
  const systemPrompt = getFlag(flags, "system-prompt") ?? "";
  const tone = getFlag(flags, "tone") ?? "";
  const handoffInstruction = getFlag(flags, "handoff-instruction") ?? "";
  const notification = getBooleanFlag(flags, "notification");
  const setDefault = getBooleanFlag(flags, "default");

  const delayRaw = getFlag(flags, "delay");
  let delay = 0;
  if (delayRaw !== undefined && delayRaw !== null) {
    delay = parseInt(delayRaw, 10);
    if (isNaN(delay) || delay < 0) {
      printJson(err(`--delay must be a non-negative integer, got: ${delayRaw}`));
      return;
    }
  }

  // Parse trigger keywords from comma-separated string into an array
  const triggerKeywordsRaw = getFlag(flags, "trigger-keywords");
  const humanTriggerKeywords = triggerKeywordsRaw
    ? triggerKeywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  const config = loadConfig({ requireToken: true });

  const payload = {
    bot_name: name.trim(),
    mission,
    system_prompt: systemPrompt,
    knowledge_base: knowledgeBase,
    tone,
    delay,
    default: setDefault,
    notification,
    human_trigger_keywords: humanTriggerKeywords,
    handoff_instruction: handoffInstruction,
    files_metadatas: [],
    file_texts: {},
  };

  const result = await requestJson(config, {
    method: "POST",
    path: "/api:Sc_sezER/ai_config",
    body: payload,
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  const data = result.data;

  // Detect OpenAI failure: Xano returns HTTP 200 but the response is a
  // team_creation_log record (not a bot_config record).
  // A bot_config record always has a `bot_name` field.
  if (typeof data?.bot_name !== "string") {
    printJson(
      err(
        "Failed to create the OpenAI assistant. The bot was not saved. " +
          "Check your workspace's OpenAI API key in Notifyer settings.",
        data,
        true
      )
    );
    return;
  }

  printJson(ok(data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
