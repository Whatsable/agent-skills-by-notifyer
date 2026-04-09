#!/usr/bin/env node
/**
 * delete-scheduled.js — Cancel and delete a scheduled message.
 *
 * DELETE /api:bVXsw_FD/web/chat_schedule/:id
 *
 * Use this to cancel a scheduled message before it fires.
 * Get the id from: node scripts/list-scheduled.js
 *
 * Usage:
 *   node scripts/delete-scheduled.js --id 7 --confirm
 *   node scripts/delete-scheduled.js --id 7 --confirm --pretty
 *
 * Required Flags:
 *   --id <number>   Scheduled message ID (integer, from list-scheduled.js).
 *   --confirm       Required safety flag to prevent accidental deletion.
 *
 * Optional Flags:
 *   --pretty        Print deletion confirmation to stderr.
 *
 * Output (success):
 *   { "ok": true, "data": { "deleted": true, "id": 7 } }
 *
 * Note: Xano returns HTTP 200 with an empty body on success (similar to
 *   other DELETE endpoints). Script synthesises a consistent success response.
 *
 * CORS: Xano runs /cors_origin_web_chat on this endpoint.
 *   Script sends Origin: https://chat.notifyer-systems.com.
 *
 * Already-fired messages: If the scheduled message has already been sent,
 *   the DELETE may return 404 or succeed (depends on Xano implementation).
 *   The record may have been cleared from the table after firing.
 *
 * Auth: Authorization: <token> (raw JWT, no Bearer — chat auth mode).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 *   NOTIFYER_CHAT_ORIGIN     optional (default: https://chat.notifyer-systems.com)
 */

import { loadConfig, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag, getNumberFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const CHAT_ORIGIN = process.env.NOTIFYER_CHAT_ORIGIN ?? "https://chat.notifyer-systems.com";

async function main() {
  const flags = parseArgs();
  const id = getNumberFlag(flags, "id");
  const confirm = getBooleanFlag(flags, "confirm");
  const pretty = getBooleanFlag(flags, "pretty");

  if (id === null || id === undefined) {
    printJson(err("--id is required. Provide the scheduled message ID (from list-scheduled.js)."));
    return;
  }
  if (!confirm) {
    printJson(err("--confirm is required to prevent accidental deletion. Add --confirm to proceed."));
    return;
  }

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  const baseUrl = process.env.NOTIFYER_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.NOTIFYER_API_TOKEN;

  const response = await fetch(`${baseUrl}/api:bVXsw_FD/web/chat_schedule/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: token,
      Origin: CHAT_ORIGIN,
    },
  });

  if (!response.ok) {
    let errorData;
    try { errorData = await response.json(); } catch { errorData = await response.text(); }
    if (response.status === 404) {
      printJson(err(`Scheduled message with ID ${id} not found. It may have already fired or been deleted.`, null, false));
    } else {
      printJson(err(`Delete failed (HTTP ${response.status})`, errorData, false, response.status));
    }
    return;
  }

  if (pretty) {
    process.stderr.write(`\nScheduled message ID ${id} deleted successfully.\n\n`);
  }

  printJson(ok({ deleted: true, id: Number(id) }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
