#!/usr/bin/env node
/**
 * send-attachment.js — Upload a file and send it as a WhatsApp media message.
 *
 * Step 1: POST /api:ox_LN9zX/upload_file_by_attachment  (multipart/form-data)
 * Step 2: POST /api:bVXsw_FD/web/send/attachment        (JSON)
 *
 * Both steps use AUTH_MODE_CHAT (raw JWT, no Bearer).
 * Step 1 uses CORS (Origin: https://chat.notifyer-systems.com).
 * Step 2: no extra CORS header needed.
 *
 * Supported Media Types:
 *   image     .jpg, .jpeg, .png, .gif, .webp   (max 5 MB)
 *   video     .mp4                              (max 16 MB)
 *   audio     .aac, .mp3, .ogg, .amr, .opus    (max 16 MB)
 *   document  .pdf, .docx, .xlsx, .txt, etc.   (max 100 MB)
 *
 * Usage:
 *   node scripts/send-attachment.js --phone 14155550123 --file /path/to/invoice.pdf
 *   node scripts/send-attachment.js --phone 14155550123 --file /path/to/photo.jpg
 *   node scripts/send-attachment.js --phone 14155550123 --file /path/to/video.mp4 --caption "Watch this!"
 *   node scripts/send-attachment.js --phone 14155550123 --file /path/to/photo.jpg --schedule "25/01/2025 14:00"
 *
 * Required Flags:
 *   --phone <number>    Recipient phone number WITHOUT + prefix (integer).
 *   --file <path>       Absolute or relative path to the file to upload.
 *
 * Optional Flags:
 *   --caption <text>    Optional caption for image/video messages.
 *   --schedule <time>   Schedule the message: "DD/MM/YYYY HH:mm"
 *                       When set, Xano saves to chat_schedule (no immediate send).
 *   --pretty            Print upload and send summary to stderr.
 *
 * Xano Upload Response (Step 1):
 *   { url: "https://...", mime_type: "image/jpeg", ... }
 *
 * Send Payload (Step 2) built by this script from Step 1 response:
 *   {
 *     url: <uploaded_url>,
 *     mime_type: <mime>,
 *     phone_number: <int>,
 *     caption: <string|"">,
 *     currentRecipient: { phone_number: <int> },
 *     scheduled_time: <ms|0>
 *   }
 *
 * The script must call get_recipient_by_phone first to build a full
 * currentRecipient object — OR can use minimal {phone_number} if full
 * recipient data is unavailable. The script uses minimal form for simplicity.
 *
 * Side effects on success:
 *   - Logs to chat_log, conversation tables
 *   - Fires /send_outgoing_message_by_webhook if webhooks configured
 *
 * CRITICAL — 24h Window Rule: same as send-text.js.
 *   Attachments can only be sent within 24h of recipient's last message.
 *   For outside the window, use send-template.js with a media template.
 *
 * Auth: Authorization: <token> (raw JWT, no Bearer — chat auth mode).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 *   NOTIFYER_CHAT_ORIGIN     optional (default: https://chat.notifyer-systems.com)
 */

import { readFileSync } from "fs";
import { basename, extname } from "path";
import { loadConfig, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const CHAT_ORIGIN = process.env.NOTIFYER_CHAT_ORIGIN ?? "https://chat.notifyer-systems.com";

const MIME_MAP = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".aac": "audio/aac", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
  ".amr": "audio/amr", ".opus": "audio/opus",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
};

function parseDateDDMMYYYY(str) {
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00`);
  return isNaN(d.getTime()) ? null : d.getTime();
}

async function uploadFile(config, filePath) {
  const baseUrl = process.env.NOTIFYER_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.NOTIFYER_API_TOKEN;

  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext] ?? "application/octet-stream";
  const fileName = basename(filePath);
  const fileBuffer = readFileSync(filePath);

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append("file", blob, fileName);

  const response = await fetch(`${baseUrl}/api:ox_LN9zX/upload_file_by_attachment`, {
    method: "POST",
    headers: {
      Authorization: token,
      Origin: CHAT_ORIGIN,
    },
    body: formData,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!response.ok) {
    let errorData;
    try { errorData = JSON.parse(text); } catch { errorData = text; }
    return { ok: false, error: `Upload failed (HTTP ${response.status})`, data: errorData };
  }

  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: true, data, mime_type: mimeType };
}

async function sendAttachment(config, body) {
  const baseUrl = process.env.NOTIFYER_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.NOTIFYER_API_TOKEN;

  const response = await fetch(`${baseUrl}/api:bVXsw_FD/web/send/attachment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!response.ok) {
    return { ok: false, error: `Send failed (HTTP ${response.status})`, data };
  }
  return { ok: true, data };
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const filePath = getFlag(flags, "file");
  const caption = getFlag(flags, "caption") ?? "";
  const scheduleStr = getFlag(flags, "schedule");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required. Provide phone number without + prefix (e.g. 14155550123)."));
    return;
  }
  if (!filePath) {
    printJson(err("--file is required. Provide the path to the file to upload."));
    return;
  }

  const phone = parseInt(phoneRaw.replace(/^\+/, ""), 10);
  if (isNaN(phone)) {
    printJson(err("--phone must be a valid integer phone number."));
    return;
  }

  let fileBuffer;
  try { fileBuffer = readFileSync(filePath); } catch {
    printJson(err(`File not found or unreadable: ${filePath}`));
    return;
  }

  let scheduledTime = 0;
  if (scheduleStr) {
    const ms = parseDateDDMMYYYY(scheduleStr);
    if (!ms) {
      printJson(err(`Invalid --schedule format. Use "DD/MM/YYYY HH:mm" (e.g. "25/01/2025 14:00").`));
      return;
    }
    scheduledTime = ms;
  }

  const config = loadConfig({ authMode: AUTH_MODE_CHAT, requireToken: true });

  if (pretty) process.stderr.write(`\nUploading file: ${basename(filePath)}...\n`);

  const uploadResult = await uploadFile(config, filePath);
  if (!uploadResult.ok) {
    printJson(err(uploadResult.error, uploadResult.data));
    return;
  }

  const uploadedUrl = uploadResult.data?.url ?? uploadResult.data;
  const mimeType = uploadResult.data?.mime_type ?? uploadResult.mime_type ?? "application/octet-stream";

  if (pretty) {
    process.stderr.write(`  Uploaded URL: ${uploadedUrl}\n`);
    process.stderr.write(`  MIME: ${mimeType}\n`);
    process.stderr.write(`Sending attachment...\n`);
  }

  const sendBody = {
    url: uploadedUrl,
    mime_type: mimeType,
    phone_number: phone,
    caption,
    currentRecipient: { phone_number: phone },
    scheduled_time: scheduledTime,
  };

  const sendResult = await sendAttachment(config, sendBody);
  if (!sendResult.ok) {
    printJson(err(sendResult.error, sendResult.data));
    return;
  }

  const d = sendResult.data;
  if (d?.success === false) {
    printJson(err(d.message || "Attachment send failed (API returned success: false)", d, false));
    return;
  }

  if (pretty) {
    if (scheduledTime) {
      process.stderr.write(`\nAttachment scheduled for ${scheduleStr}\n`);
    } else {
      process.stderr.write(`\nAttachment sent!\n`);
    }
    process.stderr.write(`  To: +${phone}\n`);
    process.stderr.write(`  File: ${basename(filePath)}\n`);
    if (caption) process.stderr.write(`  Caption: "${caption}"\n`);
    process.stderr.write("\n");
  }

  printJson(ok({ uploaded_url: uploadedUrl, mime_type: mimeType, send_result: d }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
