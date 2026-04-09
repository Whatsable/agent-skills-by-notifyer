#!/usr/bin/env node
/**
 * update-recipient.js — Update editable fields on a recipient's profile.
 *
 * Strategy (fetch-then-patch):
 *   1. GET /api:bVXsw_FD/web/recipient?search=<phone> → find recipient + current state
 *   2. PATCH /api:bVXsw_FD/web/recipient/:id with only the changed fields
 *
 * Editable fields covered by this script:
 *   - name        Display name shown in the chat sidebar
 *
 * Fields managed by other dedicated scripts (not here):
 *   - note              → use add-note.js
 *   - global_label      → use assign-label.js / remove-label.js
 *   - is_ai_assistant   → use set-handoff.js
 *   - ai_bot_id         → use assign-bot.js
 *
 * Usage:
 *   node scripts/update-recipient.js --phone 14155550123 --name "John Doe"
 *   node scripts/update-recipient.js --phone 14155550123 --name "John Doe" --pretty
 *
 * Required Flags:
 *   --phone <number>    Recipient phone number WITHOUT + prefix (integer).
 *
 * Update Flags (at least one required):
 *   --name <text>       New display name for the recipient.
 *
 * Optional Flags:
 *   --pretty            Print before/after state to stderr.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 42,
 *       "phone_number": 14155550123,
 *       "name": "John Doe",
 *       "updated_fields": { "name": "John Doe" }
 *     }
 *   }
 *
 * CORS: Xano runs /cors_origin_web_chat on PATCH /web/recipient/:id.
 *   Script sends Origin: https://chat.notifyer-systems.com.
 *
 * Auth: Authorization: <token> (raw JWT, no Bearer — chat auth mode).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 *   NOTIFYER_CHAT_ORIGIN     optional (default: https://chat.notifyer-systems.com)
 */

import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const CHAT_ORIGIN = process.env.NOTIFYER_CHAT_ORIGIN ?? "https://chat.notifyer-systems.com";

async function findRecipient(config, phone) {
  const parts = [
    `page_number=0`,
    `per_page=20`,
    `search=${encodeURIComponent(String(phone))}`,
    `labels=[]`,
    `status=`,
  ];
  const result = await requestJson(config, {
    method: "GET",
    path: `/api:bVXsw_FD/web/recipient?${parts.join("&")}`,
    extraHeaders: { Origin: CHAT_ORIGIN },
  });
  if (!result.ok) return result;
  const items = Array.isArray(result.data) ? result.data : [];
  const match = items.find((row) => {
    const r = row.recipient ?? row;
    return String(r.phone_number) === String(phone) ||
      String(r.phone_number_string ?? "").replace(/\D/g, "") === String(phone).replace(/\D/g, "");
  });
  if (!match) return { ok: false, error: `Recipient with phone ${phone} not found.` };
  return { ok: true, data: match.recipient ?? match };
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const name = getFlag(flags, "name");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required. Provide phone number without + prefix (e.g. 14155550123)."));
    return;
  }

  // Collect all fields to update
  const updates = {};
  if (name !== undefined) updates.name = name;

  if (Object.keys(updates).length === 0) {
    printJson(err("At least one update flag is required. Available: --name <text>"));
    return;
  }

  const phone = phoneRaw.replace(/^\+/, "");

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  const findResult = await findRecipient(config, phone);
  if (!findResult.ok) {
    printJson(err(findResult.error, findResult.data, false, findResult.status));
    return;
  }

  const recipient = findResult.data;

  if (pretty) {
    process.stderr.write(`\nUpdating recipient: +${phone} (ID: ${recipient.id})\n`);
    for (const [field, value] of Object.entries(updates)) {
      const current = recipient[field] ?? "(empty)";
      process.stderr.write(`  ${field}: "${current}" → "${value}"\n`);
    }
    process.stderr.write("\n");
  }

  const patchResult = await requestJson(config, {
    method: "PATCH",
    path: `/api:bVXsw_FD/web/recipient/${recipient.id}`,
    body: updates,
    extraHeaders: { Origin: CHAT_ORIGIN },
  });

  if (!patchResult.ok) {
    printJson(err(patchResult.error, patchResult.data, false, patchResult.status));
    return;
  }

  const d = patchResult.data ?? {};

  printJson(ok({
    id: recipient.id,
    phone_number: recipient.phone_number,
    name: d.name ?? updates.name ?? recipient.name,
    updated_fields: updates,
  }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
