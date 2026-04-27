#!/usr/bin/env node
/**
 * send-feedback.js — Send agent feedback to the Notifyer team.
 *
 * POST /api:ox_LN9zX/agent_feedback
 *
 * Use this script when you encounter an issue, need a clarification,
 * want to request a feature, or find a security concern while using
 * any of the agent-skills-by-notifyer skills. Feedback is recorded in
 * the Notifyer backend and reviewed by the WhatsAble team.
 *
 * Usage:
 *   node scripts/send-feedback.js --feedback "message"
 *   node scripts/send-feedback.js --feedback "message" --type error --skill chat-notifyer --script send-text.js
 *   node scripts/send-feedback.js --feedback "message" --pretty
 *
 * Flags:
 *   --feedback  <text>   The feedback message (required)
 *   --type      <tag>    Category: error | request | unclear | security | improvement | general
 *                        Defaults to "general". Prepended to the feedback body.
 *   --skill     <name>   Which skill triggered this feedback (optional context)
 *                        e.g. setup-notifyer | automate-notifyer | chat-notifyer
 *   --script    <name>   Which script triggered this feedback (optional context)
 *                        e.g. send-text.js | create-broadcast.js
 *   --pretty             Print a human-readable confirmation to stderr
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": "...",
 *       "created_at": 1700000000000,
 *       "user_id": "uuid",
 *       "feedback": "[error] ..."
 *     }
 *   }
 *
 * Output (failure):
 *   { "ok": false, "error": "...", "blocked": false }
 *
 * When to send feedback (agent guidance):
 *   - A script returns an unexpected error or an undocumented response shape
 *   - An endpoint behaves differently from what SKILL.md or the reference docs describe
 *   - A workflow step is unclear or the documentation is missing information
 *   - You encounter a potential security issue (wrong auth mode, data exposure, etc.)
 *   - A feature or endpoint is missing that would improve your ability to complete the task
 *   - Any other observation the development team should know about
 *
 * Notes:
 *   - Uses Console auth (Authorization: Bearer <jwt>). Requires NOTIFYER_API_TOKEN.
 *   - `user_id` and `created_at` are populated server-side from the token — not sent
 *     in the request body. The feedback payload only contains the `feedback` text field.
 *   - Valid --type values: error, request, unclear, security, improvement, general
 *     Any other value is normalised to "general" to avoid API rejections.
 *   - This script lives in setup-notifyer but applies to all three skills.
 *     Run it from any skill directory — it only needs NOTIFYER_API_BASE_URL and
 *     NOTIFYER_API_TOKEN to be set.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const VALID_TYPES = ["error", "request", "unclear", "security", "improvement", "general"];

function usage() {
  console.error(`
Usage:
  node scripts/send-feedback.js --feedback <message> [options]

Required:
  --feedback <text>   The feedback message to send

Optional:
  --type <tag>        Category: error | request | unclear | security | improvement | general
                      Default: general
  --skill <name>      Skill context: setup-notifyer | automate-notifyer | chat-notifyer
  --script <name>     Script that triggered the feedback: e.g. send-text.js
  --pretty            Print a human-readable confirmation to stderr

Examples:
  node scripts/send-feedback.js \\
    --feedback "send-text.js returns HTTP 200 even when the 24h window is closed" \\
    --type error --skill chat-notifyer --script send-text.js

  node scripts/send-feedback.js \\
    --feedback "Need a script to list all open conversations sorted by last message time" \\
    --type request --skill chat-notifyer

  node scripts/send-feedback.js \\
    --feedback "The SKILL.md does not explain what happens when recipient_id is missing from send-template" \\
    --type unclear --skill chat-notifyer --script send-template.js
`);
  process.exit(1);
}

/**
 * Build a structured feedback string from the user's input.
 * The Xano table has a single `feedback` text column, so all context
 * is embedded in the string body for easy review in the data table.
 *
 * Format:
 *   [type] feedback message
 *
 *   Skill: <skill>
 *   Script: <script>
 */
function buildFeedbackPayload(feedback, type, skill, script) {
  const tag = VALID_TYPES.includes(type?.toLowerCase()) ? type.toLowerCase() : "general";
  const lines = [`[${tag}] ${feedback.trim()}`];

  const meta = [];
  if (skill) meta.push(`Skill: ${skill}`);
  if (script) meta.push(`Script: ${script}`);
  if (meta.length > 0) {
    lines.push(""); // blank line separator
    lines.push(...meta);
  }

  return lines.join("\n");
}

async function main() {
  const flags = parseArgs();
  const feedback = getFlag(flags, "feedback");
  const type = getFlag(flags, "type") ?? "general";
  const skill = getFlag(flags, "skill") ?? null;
  const script = getFlag(flags, "script") ?? null;
  const pretty = getBooleanFlag(flags, "pretty");

  if (!feedback || !feedback.trim()) {
    console.error("Error: --feedback is required and cannot be empty.\n");
    usage();
  }

  const config = loadConfig({ requireToken: true });

  const payload = buildFeedbackPayload(feedback, type, skill, script);

  const result = await requestJson(config, {
    method: "POST",
    path: "/api:ox_LN9zX/agent_feedback",
    body: { feedback: payload },
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  if (pretty) {
    const rec = result.data;
    process.stderr.write(`\nFeedback submitted\n`);
    process.stderr.write(`${"─".repeat(60)}\n`);
    process.stderr.write(`ID:         ${rec?.id ?? "(unknown)"}\n`);
    process.stderr.write(`Recorded:   ${rec?.created_at ? new Date(rec.created_at).toISOString() : "now"}\n`);
    process.stderr.write(`\nPayload sent:\n${payload}\n\n`);
  }

  printJson(ok(result.data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
