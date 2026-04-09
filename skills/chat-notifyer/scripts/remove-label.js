#!/usr/bin/env node
/**
 * remove-label.js — Remove a label from a WhatsApp recipient (conversation).
 *
 * Strategy (fetch-then-patch):
 *   1. GET /api:bVXsw_FD/web/recipient?search=<phone> → find recipient
 *   2. Filter out the label from global_label array
 *   3. PATCH /api:bVXsw_FD/web/recipient/:id  { global_label: [...] }
 *
 * Usage:
 *   node scripts/remove-label.js --phone 14155550123 --label "Support"
 *   node scripts/remove-label.js --phone 14155550123 --label "VIP" --pretty
 *
 * Required Flags:
 *   --phone <number>    Recipient phone number WITHOUT + prefix (integer).
 *   --label <name>      Label name to remove (case-sensitive, must exist on recipient).
 *
 * Optional Flags:
 *   --pretty            Print before/after state to stderr.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 42,
 *       "global_label": ["Billing"],
 *       "removed": "Support"
 *     }
 *   }
 *
 * Idempotent: if the label is not present, returns ok with current state.
 *
 * CORS: Both GET and PATCH use /cors_origin_web_chat.
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

async function patchRecipient(config, id, fields) {
  return requestJson(config, {
    method: "PATCH",
    path: `/api:bVXsw_FD/web/recipient/${id}`,
    body: fields,
    extraHeaders: { Origin: CHAT_ORIGIN },
  });
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const label = getFlag(flags, "label");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required."));
    return;
  }
  if (!label) {
    printJson(err("--label is required. Provide the label name to remove (e.g. \"Support\")."));
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
  const existingLabels = Array.isArray(recipient.global_label) ? recipient.global_label : [];

  if (!existingLabels.includes(label)) {
    if (pretty) {
      process.stderr.write(`\nLabel "${label}" is not assigned to ${recipient.name ?? recipient.phone_number}.\n`);
      process.stderr.write(`  Current labels: [${existingLabels.join(", ")}]\n\n`);
    }
    printJson(ok({ id: recipient.id, global_label: existingLabels, removed: null, message: "Label was not assigned" }));
    return;
  }

  const newLabels = existingLabels.filter((l) => l !== label);

  if (pretty) {
    process.stderr.write(`\nRemoving label "${label}" from ${recipient.name ?? recipient.phone_number}\n`);
    process.stderr.write(`  Before: [${existingLabels.join(", ")}]\n`);
    process.stderr.write(`  After:  [${newLabels.join(", ")}]\n\n`);
  }

  const patchResult = await patchRecipient(config, recipient.id, { global_label: newLabels });
  if (!patchResult.ok) {
    printJson(err(patchResult.error, patchResult.data, false, patchResult.status));
    return;
  }

  printJson(ok({ id: recipient.id, global_label: newLabels, removed: label }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
