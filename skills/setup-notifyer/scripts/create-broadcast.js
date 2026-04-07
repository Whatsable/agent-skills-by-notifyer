#!/usr/bin/env node
/**
 * create-broadcast.js — Create and schedule a WhatsApp broadcast.
 *
 * This script executes the full 3-step broadcast creation workflow:
 *
 *   Step 1 — POST /api:6_ZYypAc/broadcast_test
 *             Initialises a broadcast_schedule record and sends a test WhatsApp
 *             message to verify the template renders correctly.
 *
 *   Step 2 — POST /api:6_ZYypAc/broadcast_user_recipient_numbers  (multipart)
 *             Uploads the recipient CSV file. Xano parses the CSV, deduplicates
 *             phone numbers, calculates cost per country code, and stores the list.
 *
 *   Step 3 — POST /api:6_ZYypAc/broadcast_schedule
 *             Finalises delivery settings (mode, batch size, read rate, schedule
 *             time) and creates the broadcast job.
 *
 * Usage:
 *   node scripts/create-broadcast.js \
 *     --name "January Sale" \
 *     --template-id 42 \
 *     --test-phone "+14155550123" \
 *     --recipients /path/to/recipients.csv \
 *     --schedule "25/01/2025 14:00" \
 *     --delivery-mode smart \
 *     --delivery-size 4 \
 *     --read-rate 95
 *
 *   # With template variables (for templates with {{1}} placeholders):
 *   node scripts/create-broadcast.js \
 *     --name "Order Update" \
 *     --template-id 42 \
 *     --test-phone "+14155550123" \
 *     --variables '{"1":"John","2":"12345"}' \
 *     --recipients /path/to/recipients.csv \
 *     --schedule "25/01/2025 09:00" \
 *     --delivery-mode regular \
 *     --delivery-size 10
 *
 *   # Risk mode (sends without batching — no delivery_size needed):
 *   node scripts/create-broadcast.js \
 *     --name "Urgent Alert" \
 *     --template-id 42 \
 *     --test-phone "+14155550123" \
 *     --recipients /path/to/recipients.csv \
 *     --schedule "25/01/2025 10:00" \
 *     --delivery-mode risk
 *
 * Required flags:
 *   --name <text>              Broadcast display name
 *   --template-id <integer>    Notifyer template ID (from list-templates.js)
 *   --test-phone <text>        Phone number for the test message (include country code, e.g. +1...)
 *   --recipients <path>        Path to the recipient CSV file
 *   --schedule <text>          Schedule datetime: "DD/MM/YYYY HH:mm" (interpreted in the
 *                              server's detected timezone via IP lookup)
 *   --delivery-mode <text>     smart | regular | risk
 *
 * Optional flags:
 *   --variables <json>         Template variable values  e.g. '{"1":"John","2":"#123"}'
 *   --labels <csv>             Comma-separated label names to scope the broadcast
 *   --delivery-size <integer>  Batch size per minute (required for smart/regular; omit for risk)
 *   --read-rate <integer>      Target read rate % (required when --delivery-mode smart)
 *
 * Delivery modes:
 *   smart    — Sends in batches; Xano adjusts pace based on a target read-rate percentage.
 *              Requires --delivery-size and --read-rate.
 *   regular  — Sends in fixed batches per minute. Requires --delivery-size.
 *   risk     — Sends all at once with no batching. Highest delivery risk for Meta ban.
 *              Do NOT use --delivery-size with this mode.
 *
 * CSV format:
 *   The recipient CSV must have a `phone_number` column (and optionally variable
 *   columns like `body1`, `body2`, `button_dynamic_url_value`, `media`).
 *   Download a template CSV using the broadcast console UI after selecting a template.
 *
 *   Example CSV:
 *     phone_number,body1,body2
 *     14155550101,John,12345
 *     14155550102,Jane,67890
 *
 *   Phone numbers in the CSV should NOT include the "+" prefix — Xano handles formatting.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "broadcast_identifier": "uuid...",
 *       "test": { "success": true, "message": "...", "whatsapp_response_info": { ... } },
 *       "recipients": { "unique_numbers": 1200, "cost_of_broadcast": 1.44, "existing_credit": 5.0 },
 *       "schedule": { "success": true, "message": "...", "broadcast_id": "uuid..." }
 *     }
 *   }
 *
 * Output (step failure):
 *   {
 *     "ok": false,
 *     "error": "Step 1 (test) failed: ...",
 *     "step": 1,
 *     "data": { ... }
 *   }
 *
 * IMPORTANT — Schedule is timezone-sensitive:
 *   Xano resolves the caller's timezone via an IP Address Lookup. The schedule
 *   "25/01/2025 14:00" is interpreted as 2:00 PM in the timezone of the machine
 *   making the API call. Always verify the resulting schedule time in the console.
 *
 * Prerequisites:
 *   - WhatsApp connection must be active (check with get-connection-status.js)
 *   - Template must be approved (check with list-templates.js --status approved)
 *   - Account must have sufficient credit (check with get-user-plan.js)
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { createReadStream, existsSync } from "fs";
import { basename } from "path";
import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const CONSOLE_ORIGIN = "https://console.notifyer-systems.com";
const VALID_MODES = ["smart", "regular", "risk"];

/**
 * Upload recipient CSV via multipart/form-data.
 * Uses raw fetch because requestJson only handles JSON bodies.
 */
async function uploadRecipients(config, broadcastIdentifier, csvPath) {
  const url = `${config.baseUrl}/api:6_ZYypAc/broadcast_user_recipient_numbers`;

  const fileContent = createReadStream(csvPath);
  // Node.js 18+ fetch supports FormData with Blob/File
  const { readFileSync } = await import("fs");
  const fileBytes = readFileSync(csvPath);
  const file = new File([fileBytes], basename(csvPath), { type: "text/csv" });

  const formData = new FormData();
  formData.append("broadcast_identifier", broadcastIdentifier);
  formData.append("file", file);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Origin: CONSOLE_ORIGIN,
        // Content-Type is NOT set manually — browser/fetch sets it with boundary for FormData
      },
      body: formData,
    });
  } catch (e) {
    return { ok: false, error: `Network error: ${e.message}` };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const msg =
      (typeof body === "object" && body?.message) ||
      (typeof body === "string" && body) ||
      `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status, data: body };
  }

  return { ok: true, data: body };
}

async function main() {
  const flags = parseArgs();

  // --- Required flags ---
  const name = getFlag(flags, "name");
  const templateIdRaw = getFlag(flags, "template-id");
  const testPhone = getFlag(flags, "test-phone");
  const csvPath = getFlag(flags, "recipients");
  const schedule = getFlag(flags, "schedule");
  const deliveryMode = getFlag(flags, "delivery-mode")?.toLowerCase();

  const missing = [];
  if (!name?.trim()) missing.push("--name");
  if (!templateIdRaw) missing.push("--template-id");
  if (!testPhone?.trim()) missing.push("--test-phone");
  if (!csvPath?.trim()) missing.push("--recipients");
  if (!schedule?.trim()) missing.push("--schedule");
  if (!deliveryMode) missing.push("--delivery-mode");

  if (missing.length > 0) {
    printJson(err(`Missing required flags: ${missing.join(", ")}`));
    return;
  }

  const templateId = Number(templateIdRaw);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    printJson(err(`--template-id must be a positive integer, got: ${templateIdRaw}`));
    return;
  }

  if (!VALID_MODES.includes(deliveryMode)) {
    printJson(err(`--delivery-mode must be one of: ${VALID_MODES.join(", ")}. Got: "${deliveryMode}"`));
    return;
  }

  // delivery-size required for smart and regular
  const deliverySizeRaw = getFlag(flags, "delivery-size");
  let deliverySize;
  if (deliveryMode !== "risk") {
    if (!deliverySizeRaw) {
      printJson(
        err(`--delivery-size is required when --delivery-mode is "${deliveryMode}".`)
      );
      return;
    }
    deliverySize = parseInt(deliverySizeRaw, 10);
    if (isNaN(deliverySize) || deliverySize <= 0) {
      printJson(err(`--delivery-size must be a positive integer, got: ${deliverySizeRaw}`));
      return;
    }
  }

  // read-rate required for smart
  const readRateRaw = getFlag(flags, "read-rate");
  let readRate;
  if (deliveryMode === "smart") {
    if (!readRateRaw) {
      printJson(err("--read-rate is required when --delivery-mode is smart."));
      return;
    }
    readRate = parseInt(readRateRaw, 10);
    if (isNaN(readRate) || readRate < 1 || readRate > 100) {
      printJson(err(`--read-rate must be an integer 1–100, got: ${readRateRaw}`));
      return;
    }
  }

  // Validate schedule format: DD/MM/YYYY HH:mm
  if (!/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(schedule.trim())) {
    printJson(
      err(
        `--schedule must be in format "DD/MM/YYYY HH:mm" (e.g. "25/01/2025 14:00"). Got: "${schedule}"`
      )
    );
    return;
  }

  // Validate CSV path
  if (!existsSync(csvPath)) {
    printJson(err(`Recipient CSV file not found: ${csvPath}`));
    return;
  }

  // Parse optional flags
  let variables = {};
  const variablesRaw = getFlag(flags, "variables");
  if (variablesRaw) {
    try {
      variables = JSON.parse(variablesRaw);
    } catch {
      printJson(err(`--variables must be valid JSON. Got: ${variablesRaw}`));
      return;
    }
  }

  const labelsRaw = getFlag(flags, "labels");
  const globalLabel = labelsRaw
    ? labelsRaw.split(",").map((l) => l.trim()).filter(Boolean)
    : [];

  const config = loadConfig({ requireToken: true });

  // Generate the broadcast_identifier UUID that links all 3 steps
  const broadcastIdentifier = crypto.randomUUID();

  // ─── Step 1: Send test message ────────────────────────────────────────────
  process.stderr.write(`[1/3] Sending test message to ${testPhone}...\n`);

  const testResult = await requestJson(config, {
    method: "POST",
    path: "/api:6_ZYypAc/broadcast_test",
    body: {
      template_id: templateId,
      phone_number: testPhone.trim(),
      broadcast_identifier: broadcastIdentifier,
      variables,
      global_label: globalLabel,
    },
    extraHeaders: { Origin: CONSOLE_ORIGIN },
  });

  if (!testResult.ok) {
    printJson(
      err(`Step 1 (test) failed: ${testResult.error}`, testResult.data, false, testResult.status)
    );
    return;
  }

  const testData = testResult.data;

  // broadcast_test returns send_message_response via Return statement (not a response key).
  // If `success` is false, the WhatsApp send failed.
  if (testData?.success === false) {
    const whatsappErr = testData?.whatsapp_response_info;
    const msg =
      whatsappErr?.error_data?.details ||
      whatsappErr?.message ||
      testData?.message ||
      "Test message was not delivered by WhatsApp.";
    printJson(err(`Step 1 (test) failed: ${msg}`, testData, false));
    return;
  }

  process.stderr.write(`    ✓ Test message sent. broadcast_identifier: ${broadcastIdentifier}\n`);

  // ─── Step 2: Upload recipient CSV ─────────────────────────────────────────
  process.stderr.write(`[2/3] Uploading recipients from ${basename(csvPath)}...\n`);

  const uploadResult = await uploadRecipients(config, broadcastIdentifier, csvPath);

  if (!uploadResult.ok) {
    printJson(
      err(
        `Step 2 (upload) failed: ${uploadResult.error}`,
        uploadResult.data,
        false,
        uploadResult.status
      )
    );
    return;
  }

  const recipientsData = uploadResult.data;
  const uniqueNumbers = recipientsData?.unique_numbers ?? 0;
  const costOfBroadcast = recipientsData?.cost_of_broadcast ?? 0;

  process.stderr.write(
    `    ✓ ${uniqueNumbers} unique numbers loaded. Estimated cost: $${costOfBroadcast.toFixed(4)}\n`
  );

  // ─── Step 3: Schedule the broadcast ───────────────────────────────────────
  process.stderr.write(`[3/3] Scheduling broadcast for ${schedule.trim()}...\n`);

  const schedulePayload = {
    broadcast_identifier: broadcastIdentifier,
    schedule: schedule.trim(),
    broadcast_name: name.trim(),
    delivery_mode: deliveryMode,
  };

  if (deliveryMode !== "risk") {
    schedulePayload.delivery_size = deliverySize;
  }
  if (deliveryMode === "smart") {
    schedulePayload.read_rate = readRate;
  }

  const scheduleResult = await requestJson(config, {
    method: "POST",
    path: "/api:6_ZYypAc/broadcast_schedule",
    body: schedulePayload,
    extraHeaders: { Origin: CONSOLE_ORIGIN },
  });

  if (!scheduleResult.ok) {
    printJson(
      err(
        `Step 3 (schedule) failed: ${scheduleResult.error}`,
        scheduleResult.data,
        false,
        scheduleResult.status
      )
    );
    return;
  }

  const scheduleData = scheduleResult.data;
  process.stderr.write(`    ✓ Broadcast scheduled.\n\n`);

  printJson(
    ok({
      broadcast_identifier: broadcastIdentifier,
      test: testData,
      recipients: recipientsData,
      schedule: scheduleData,
    })
  );
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
