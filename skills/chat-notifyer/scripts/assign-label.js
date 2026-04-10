#!/usr/bin/env node
/**
 * assign-label.js — Assign a label to a WhatsApp recipient (conversation).
 *
 * Strategy (fetch-then-patch):
 *   1. GET /api:bVXsw_FD/web/recipient?search=<phone> → find recipient
 *   2. Merge new label into existing global_label array
 *   3. PATCH /api:bVXsw_FD/web/recipient/:id  { global_label: [...] }
 *
 * Labels in Notifyer are global_label values on the recipient record.
 * They are STRING arrays (label names, not IDs).
 * Valid label names are created via setup-notifyer/create-label.js.
 *
 * Keyword-based auto-labelling: Notifyer's backend automatically assigns
 *   labels to incoming messages based on keyword rules defined in the label.
 *   This script assigns labels MANUALLY (agent/team-triggered).
 *
 * Usage:
 *   node scripts/assign-label.js --phone 14155550123 --label "Support"
 *   node scripts/assign-label.js --phone 14155550123 --label "VIP" --pretty
 *
 * Required Flags:
 *   --phone <number>    Recipient phone number WITHOUT + prefix (integer).
 *   --label <name>      Label name to assign (case-sensitive).
 *                       Must match an existing label created in setup-notifyer.
 *
 * Optional Flags:
 *   --pretty            Print before/after state to stderr.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 42,
 *       "global_label": ["Billing", "Support"],
 *       "added": "Support"
 *     }
 *   }
 *
 * Idempotent: if the label is already assigned, returns ok with current state.
 *
 * CORS: Xano runs /cors_origin_web_chat on PATCH /web/recipient/:id.
 *   Script sends Origin: https://chat.notifyer-systems.com.
 *   GET /web/recipient also uses CORS.
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

async function getUserId(config) {
  const result = await requestJson(config, {
    method: "GET",
    path: "/api:-4GSCDHb/auth/me",
  });
  if (!result.ok) return null;
  return result.data?.user_id ?? result.data?.id ?? null;
}

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
  if (match) return { ok: true, data: match.recipient ?? match };

  const userId = await getUserId(config);
  if (!userId) {
    return { ok: false, error: `Recipient with phone ${phone} not found (web search empty; could not resolve user for chatapp lookup).` };
  }
  const chatResult = await requestJson(config, {
    method: "GET",
    path: `/api:bVXsw_FD/chatapp/recipient?phone_number=${encodeURIComponent(String(phone))}&user_id=${userId}`,
  });
  if (!chatResult.ok) return { ok: false, error: `Recipient with phone ${phone} not found.` };
  const raw = Array.isArray(chatResult.data) ? chatResult.data[0] : chatResult.data;
  if (!raw || (Array.isArray(chatResult.data) && chatResult.data.length === 0)) {
    return { ok: false, error: `Recipient with phone ${phone} not found.` };
  }
  return { ok: true, data: raw };
}

/** Merge identity fields so PATCH does not null phone/name (Xano partial-patch behaviour). */
function buildLabelPatchBody(recipient, globalLabel) {
  const phoneNum = recipient.phone_number;
  if (phoneNum == null || phoneNum === "") {
    return { ok: false, error: "Recipient record is missing phone_number; cannot patch safely." };
  }
  const body = {
    name: recipient.name ?? "",
    phone_number: phoneNum,
    phone_number_string: recipient.phone_number_string ?? String(phoneNum),
    note: recipient.note ?? "",
    global_label: globalLabel,
  };
  if (typeof recipient.is_ai_assistant === "boolean") {
    body.is_ai_assistant = recipient.is_ai_assistant;
  }
  return { ok: true, data: body };
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
    printJson(err("--label is required. Provide the label name to assign (e.g. \"Support\")."));
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

  if (existingLabels.includes(label)) {
    if (pretty) {
      process.stderr.write(`\nLabel "${label}" already assigned to ${recipient.name ?? recipient.phone_number}.\n\n`);
    }
    printJson(ok({ id: recipient.id, global_label: existingLabels, added: null, message: "Label already assigned" }));
    return;
  }

  const newLabels = [...existingLabels, label];

  if (pretty) {
    process.stderr.write(`\nAssigning label "${label}" to ${recipient.name ?? recipient.phone_number}\n`);
    process.stderr.write(`  Before: [${existingLabels.join(", ")}]\n`);
    process.stderr.write(`  After:  [${newLabels.join(", ")}]\n\n`);
  }

  const patchFields = buildLabelPatchBody(recipient, newLabels);
  if (!patchFields.ok) {
    printJson(err(patchFields.error));
    return;
  }

  const patchResult = await patchRecipient(config, recipient.id, patchFields.data);
  if (!patchResult.ok) {
    printJson(err(patchResult.error, patchResult.data, false, patchResult.status));
    return;
  }

  printJson(ok({ id: recipient.id, global_label: newLabels, added: label }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
