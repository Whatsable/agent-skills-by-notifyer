#!/usr/bin/env node
/**
 * create-label.js — Create a new workspace label.
 *
 * POST /api:bVXsw_FD/web/label_management
 *
 * Usage:
 *   node scripts/create-label.js --label "Sales"
 *   node scripts/create-label.js --label "Support" --keywords "help,issue,ticket"
 *
 * Flags:
 *   --label <name>      Display name for the label (required)
 *   --keywords <list>   Comma-separated keyword triggers for auto-assignment (optional)
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 42,
 *       "label": "Sales",
 *       "keywords": ["buy", "pricing"],
 *       "user_id": "uuid",
 *       "created_at": 1700000000000
 *     }
 *   }
 *
 * Output (duplicate):
 *   { "ok": false, "error": "A label named 'Sales' already exists.", "blocked": true }
 *
 * Notes:
 *   - Label names must be unique across the workspace.
 *   - keywords trigger automatic label assignment when a contact message contains
 *     a matching word. Can be added/updated later with update-label-keywords.js.
 *   - Uses chat auth mode (Authorization: <token>, no Bearer prefix).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function usage() {
  console.error(`
Usage:
  node scripts/create-label.js --label <name> [--keywords <kw1,kw2,...>]

Flags:
  --label <name>       Display name for the label (required)
  --keywords <list>    Comma-separated keyword triggers (optional)

Examples:
  node scripts/create-label.js --label "Sales"
  node scripts/create-label.js --label "Support" --keywords "help,issue,problem"
`);
  process.exit(1);
}

async function main() {
  const flags = parseArgs();
  const label = getFlag(flags, "label");
  const keywordsRaw = getFlag(flags, "keywords") ?? "";

  if (!label || !label.trim()) {
    console.error("Error: --label is required.\n");
    usage();
  }

  const keywords = keywordsRaw
    ? keywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  const result = await requestJson(config, {
    method: "POST",
    path: "/api:bVXsw_FD/web/label_management",
    body: {
      label: label.trim(),
      keywords,
    },
  });

  if (!result.ok) {
    // Xano precondition fires when a label with the same name already exists.
    const isDuplicate =
      result.status === 400 ||
      (typeof result.error === "string" &&
        result.error.toLowerCase().includes("precondition"));
    if (isDuplicate) {
      printJson(
        err(
          `A label named '${label.trim()}' already exists.`,
          result.data,
          true,
          result.status
        )
      );
    }
    printJson(err(result.error, result.data, false, result.status));
  }

  printJson(ok(result.data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
