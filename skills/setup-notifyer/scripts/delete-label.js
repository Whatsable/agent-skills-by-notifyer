#!/usr/bin/env node
/**
 * delete-label.js — Permanently delete a workspace label.
 *
 * DELETE /api:bVXsw_FD/web/label_management/:id
 *
 * Usage:
 *   node scripts/delete-label.js --id 42 --confirm
 *
 * Flags:
 *   --id <n>      Label id to delete (required, integer)
 *   --confirm     Required safety flag to prevent accidental deletion
 *
 * Output (success):
 *   { "ok": true, "data": { "deleted": true, "id": 42, "label": "Sales" } }
 *
 * Output (not found):
 *   { "ok": false, "error": "Label with id 42 not found.", "blocked": true }
 *
 * Notes:
 *   - Verifies the label exists before deleting (by fetching the full list).
 *   - Deletion is permanent and cannot be undone.
 *   - Deleting a label does NOT automatically remove it from team members'
 *     assigned labels — update affected members with update-member.js.
 *   - Uses chat auth mode (Authorization: <token>, no Bearer prefix).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getNumberFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function usage() {
  console.error(`
Usage:
  node scripts/delete-label.js --id <n> --confirm

Flags:
  --id <n>    Label id to delete (required)
  --confirm   Required safety flag

Example:
  node scripts/delete-label.js --id 42 --confirm
`);
  process.exit(1);
}

async function main() {
  const flags = parseArgs();
  const id = getNumberFlag(flags, "id");
  const confirm = getBooleanFlag(flags, "confirm");

  if (!id) {
    console.error("Error: --id is required.\n");
    usage();
  }

  if (!confirm) {
    console.error(
      "Error: --confirm is required to prevent accidental deletion.\n" +
        "  This action is permanent and cannot be undone.\n"
    );
    usage();
  }

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  // Verify the label exists before deleting.
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
  const target = labels.find((l) => l.id === id);

  if (!target) {
    printJson(
      err(
        `Label with id ${id} not found. Check the id with list-labels.js.`,
        null,
        true
      )
    );
  }

  // DELETE returns an empty body — no JSON response from Xano.
  const deleteResult = await requestJson(config, {
    method: "DELETE",
    path: `/api:bVXsw_FD/web/label_management/${id}`,
  });

  if (!deleteResult.ok) {
    printJson(
      err(deleteResult.error, deleteResult.data, false, deleteResult.status)
    );
  }

  printJson(ok({ deleted: true, id, label: target.label }));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
