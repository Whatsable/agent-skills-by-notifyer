#!/usr/bin/env node
/**
 * update-label-keywords.js — Update a label's name or keywords.
 *
 * GET  /api:bVXsw_FD/web/label_management          (fetch current state)
 * PATCH /api:bVXsw_FD/web/label_management/:id     (apply changes)
 *
 * Usage:
 *   # Add one or more keywords
 *   node scripts/update-label-keywords.js --id 42 --add "urgent,priority"
 *
 *   # Remove a keyword
 *   node scripts/update-label-keywords.js --id 42 --remove "old-keyword"
 *
 *   # Replace the entire keyword list
 *   node scripts/update-label-keywords.js --id 42 --set "buy,purchase,order"
 *
 *   # Clear all keywords
 *   node scripts/update-label-keywords.js --id 42 --set ""
 *
 *   # Rename the label
 *   node scripts/update-label-keywords.js --id 42 --label "New Name"
 *
 *   # Rename AND replace keywords in one call
 *   node scripts/update-label-keywords.js --id 42 --label "VIP" --set "vip,premium"
 *
 * Flags:
 *   --id <n>          Label id to update (required, integer)
 *   --label <name>    New display name for the label
 *   --add <kws>       Comma-separated keywords to add to existing list
 *   --remove <kws>    Comma-separated keywords to remove from existing list
 *   --set <kws>       Comma-separated keywords to replace the entire list
 *                     (use --set "" to clear all keywords)
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 42,
 *       "label": "VIP",
 *       "keywords": ["vip", "premium"],
 *       "user_id": "uuid",
 *       "created_at": 1700000000000
 *     }
 *   }
 *
 * Notes:
 *   - Fetches the current label before patching to preserve unchanged fields
 *     (Xano's Edit Record requires the full record shape).
 *   - --add, --remove, and --set are mutually exclusive for keywords.
 *   - keyword comparison is case-sensitive.
 *   - Uses chat auth mode (Authorization: <token>, no Bearer prefix).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getNumberFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function usage() {
  console.error(`
Usage:
  node scripts/update-label-keywords.js --id <n> [options]

Flags:
  --id <n>          Label id to update (required)
  --label <name>    New display name
  --add <kws>       Comma-separated keywords to add
  --remove <kws>    Comma-separated keywords to remove
  --set <kws>       Comma-separated keywords to replace all (use "" to clear)

Examples:
  node scripts/update-label-keywords.js --id 5 --add "urgent,priority"
  node scripts/update-label-keywords.js --id 5 --remove "old"
  node scripts/update-label-keywords.js --id 5 --set "buy,order"
  node scripts/update-label-keywords.js --id 5 --label "VIP" --set "vip,premium"
`);
  process.exit(1);
}

function parseKeywordList(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

async function main() {
  const flags = parseArgs();
  const id = getNumberFlag(flags, "id");
  const newLabel = getFlag(flags, "label") ?? null;
  const addRaw = "add" in flags ? getFlag(flags, "add") ?? "" : null;
  const removeRaw = "remove" in flags ? getFlag(flags, "remove") ?? "" : null;
  const setRaw = "set" in flags ? getFlag(flags, "set") ?? "" : null;

  if (!id) {
    console.error("Error: --id is required.\n");
    usage();
  }

  // Ensure at most one of --add, --remove, --set
  const keywordOps = [addRaw, removeRaw, setRaw].filter((v) => v !== null);
  if (keywordOps.length > 1) {
    console.error("Error: --add, --remove, and --set are mutually exclusive.\n");
    usage();
  }

  if (!newLabel && keywordOps.length === 0) {
    console.error("Error: provide at least one of --label, --add, --remove, or --set.\n");
    usage();
  }

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  // Step 1: Fetch all visible labels and find the target by id.
  const listResult = await requestJson(config, {
    method: "GET",
    path: "/api:bVXsw_FD/web/label_management",
  });

  if (!listResult.ok) {
    printJson(
      err(
        `Failed to fetch labels: ${listResult.error}`,
        listResult.data,
        false,
        listResult.status
      )
    );
  }

  const labels = Array.isArray(listResult.data) ? listResult.data : [];
  const current = labels.find((l) => l.id === id);

  if (!current) {
    printJson(
      err(
        `Label with id ${id} not found. Check the id with list-labels.js.`,
        null,
        true
      )
    );
  }

  // Step 2: Compute updated keywords.
  let updatedKeywords = Array.isArray(current.keywords)
    ? [...current.keywords]
    : [];

  if (setRaw !== null) {
    updatedKeywords = parseKeywordList(setRaw);
  } else if (addRaw !== null) {
    const toAdd = parseKeywordList(addRaw);
    for (const kw of toAdd) {
      if (!updatedKeywords.includes(kw)) updatedKeywords.push(kw);
    }
  } else if (removeRaw !== null) {
    const toRemove = new Set(parseKeywordList(removeRaw));
    updatedKeywords = updatedKeywords.filter((kw) => !toRemove.has(kw));
  }

  const updatedName = newLabel !== null ? newLabel.trim() : current.label;

  // Step 3: PATCH with the full record shape Xano expects.
  const patchResult = await requestJson(config, {
    method: "PATCH",
    path: `/api:bVXsw_FD/web/label_management/${id}`,
    body: {
      label: updatedName,
      created_at: current.created_at,
      keywords: updatedKeywords,
    },
  });

  if (!patchResult.ok) {
    printJson(
      err(patchResult.error, patchResult.data, false, patchResult.status)
    );
  }

  printJson(ok(patchResult.data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
