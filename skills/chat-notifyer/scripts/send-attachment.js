#!/usr/bin/env node
/**
 * send-attachment.js — Upload one or more files and send them as WhatsApp media messages.
 *
 * Supports sending up to 10 files in a single call (matching the chat app's
 * FileSelectionMenu feature). Files are uploaded 3 at a time concurrently, then
 * sent sequentially — the same behaviour as the Notifyer chat frontend.
 *
 * Step 1: POST /api:bVXsw_FD/upload_file_by_attachment  (multipart/form-data, field "file")
 * Step 2: POST /api:bVXsw_FD/web/send/<type>            (JSON)
 *           where <type> is: image | video | audio | document
 *
 * The send endpoint is chosen from each file's MIME type:
 *   image     .jpg, .jpeg, .png, .gif, .webp   → /web/send/image   (max 5 MB)
 *   video     .mp4                              → /web/send/video   (max 16 MB)
 *   audio     .aac, .mp3, .ogg, .amr, .opus    → /web/send/audio   (max 16 MB)
 *   document  .pdf, .docx, .xlsx, .txt, etc.   → /web/send/document (max 100 MB)
 *
 * Steps performed by this script:
 *   1. Fetch the full recipient object (needed for currentRecipient field)
 *   2. Upload all files concurrently (3 at a time)
 *   3. Send each uploaded file sequentially — stops on first send failure
 *
 * Usage (single file — backwards compatible):
 *   node scripts/send-attachment.js --phone 14155550123 --file /path/to/invoice.pdf
 *   node scripts/send-attachment.js --phone 14155550123 --file /path/to/photo.jpg --caption "Here you go"
 *   node scripts/send-attachment.js --phone 14155550123 --file /path/to/photo.jpg   # no caption
 *
 * Usage (multiple files — shared caption):
 *   node scripts/send-attachment.js --phone 14155550123 \
 *     --files "/path/to/photo.jpg,/path/to/invoice.pdf,/path/to/video.mp4" \
 *     --caption "See attached files"
 *
 * Usage (multiple files — per-file captions):
 *   node scripts/send-attachment.js --phone 14155550123 \
 *     --files "/path/to/photo.jpg,/path/to/invoice.pdf,/path/to/video.mp4" \
 *     --captions '["Great photo","Your invoice",""]'
 *
 *   --captions is a JSON array of strings, one entry per file (positional).
 *   Use "" to send a specific file without a caption.
 *   If --captions has fewer entries than files, remaining files fall back to --caption (or no caption).
 *   --caption and --captions can be combined: --caption is the fallback for unspecified positions.
 *
 * Required Flags:
 *   --phone <number>        Recipient phone number WITHOUT + prefix (integer).
 *   --file <path>           Single file path (use for one file).
 *   --files <path,path,...> Comma-separated file paths (use for multiple files, max 10).
 *                           --file and --files cannot be used together.
 *
 * Optional Flags:
 *   --caption <text>        Caption applied to ALL files (or used as fallback when --captions
 *                           does not cover every position). Omit entirely to send without caption.
 *   --captions <json>       Per-file captions as a JSON string array, e.g. '["cap1","","cap3"]'.
 *                           Overrides --caption for each position where an entry is present.
 *                           "" at any position means no caption for that specific file.
 *   --schedule <time>       Schedule all messages: "DD/MM/YYYY HH:mm"
 *                           All files get the same scheduled time.
 *   --pretty                Print upload and send progress to stderr.
 *
 * Output (success — single file):
 *   { "ok": true, "data": { media_link, mime_type, media_type, caption, send_result } }
 *
 * Output (success — multiple files):
 *   { "ok": true, "data": { sent: [{ file, caption, media_link, ... }], failed: [], total: 3, success_count: 3 } }
 *
 * Output (failure):
 *   { "ok": false, "error": "...", "blocked": false }
 *
 * Side effects on success:
 *   - Logs to chat_log, conversation tables
 *   - Fires /send_outgoing_message_by_webhook if webhooks configured
 *
 * CRITICAL — 24h Window Rule:
 *   Media attachments can only be sent within 24h of recipient's last message.
 *   For outside the window, use send-template.js with a media template.
 *   Check the window with: node scripts/get-recipient.js --phone <number>
 *
 * Auth: Authorization: <token> (raw JWT, no Bearer — chat auth mode).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL    required
 *   NOTIFYER_API_TOKEN       required (from setup-notifyer/login.js)
 *   NOTIFYER_CHAT_ORIGIN     optional (default: https://chat.notifyer-systems.com)
 */

import { readFileSync, existsSync } from "fs";
import { basename, extname } from "path";

const MAX_FILES = 10;          // matches FileSelectionMenu MAX_FILES
const UPLOAD_CONCURRENCY = 3;  // matches FileSelectionMenu UPLOAD_CONCURRENCY
import { loadConfig, requestJson, AUTH_MODE_CHAT } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";
import { validateScheduledSendResponse } from "./lib/schedule-response.js";

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

function mimeToEndpoint(mimeType) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Meta Cloud API requires lowercase `type` plus a sibling object, e.g.
 * `{ type: "document", document: { link, filename } }` — not `type: "application/pdf"`.
 */
function buildWhatsAppMediaPayload(endpointType, mediaLink, filePath, caption) {
  const cap = caption ?? "";
  switch (endpointType) {
    case "image":
      return {
        type: "image",
        image: { link: mediaLink, ...(cap ? { caption: cap } : {}) },
      };
    case "video":
      return {
        type: "video",
        video: { link: mediaLink, ...(cap ? { caption: cap } : {}) },
      };
    case "audio":
      return { type: "audio", audio: { link: mediaLink } };
    default:
      return {
        type: "document",
        document: {
          link: mediaLink,
          filename: basename(filePath),
          caption: cap,
        },
      };
  }
}

/**
 * Parse the --captions JSON array flag.
 * Returns an array of strings (empty string = "no caption for this file").
 * Returns null when the flag is not provided.
 * Throws a descriptive Error when the value is not a valid JSON string array.
 *
 * @param {string|undefined} raw
 * @returns {string[]|null}
 */
function parseCaptionsFlag(raw) {
  if (raw == null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `--captions must be a valid JSON array, e.g. '["first caption","","third caption"]'. Parse failed on: ${raw}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `--captions must be a JSON array, not ${typeof parsed}. Example: '["caption1","caption2"]'`
    );
  }
  for (let i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== "string") {
      throw new Error(
        `--captions[${i}] must be a string. Got: ${JSON.stringify(parsed[i])}. Use "" for no caption.`
      );
    }
  }
  return parsed;
}

/**
 * Resolve the caption to use for a file at a given position index.
 *
 * Priority:
 *   1. captionsArray[index]  — if --captions was provided and has an entry at this position
 *                               (even "" is honoured, meaning "no caption")
 *   2. fallbackCaption       — --caption value, or "" if --caption was not provided
 *
 * @param {number} index
 * @param {string[]|null} captionsArray
 * @param {string} fallbackCaption
 * @returns {string}
 */
function captionForFile(index, captionsArray, fallbackCaption) {
  if (captionsArray !== null && index < captionsArray.length) {
    return captionsArray[index];
  }
  return fallbackCaption;
}

function parseDateDDMMYYYY(str) {
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00`);
  return isNaN(d.getTime()) ? null : d.getTime();
}

async function getUserId(config) {
  const result = await requestJson(config, {
    method: "GET",
    path: "/api:-4GSCDHb/auth/me",
  });
  if (!result.ok) return null;
  return result.data?.user_id ?? result.data?.id ?? null;
}

async function findRecipient(config, phone) {
  const result = await requestJson(config, {
    method: "GET",
    path: `/api:bVXsw_FD/web/recipient?page_number=0&per_page=20&search=${encodeURIComponent(String(phone))}&labels=[]&status=`,
    extraHeaders: { Origin: CHAT_ORIGIN },
  });
  if (!result.ok) return result;
  const items = Array.isArray(result.data) ? result.data : [];
  const match = items.find((row) => {
    const r = (row.recipient && typeof row.recipient === "object") ? row.recipient : row;
    return String(r.phone_number) === String(phone) ||
      String(r.phone_number_string ?? "").replace(/\D/g, "") === String(phone).replace(/\D/g, "");
  });
  if (match) return { ok: true, data: (match.recipient && typeof match.recipient === "object") ? match.recipient : match };

  const userId = await getUserId(config);
  if (!userId) {
    return { ok: false, error: `Recipient with phone ${phone} not found (web search empty; could not resolve user for chatapp lookup).` };
  }
  const chatResult = await requestJson(config, {
    method: "GET",
    path: `/api:bVXsw_FD/chatapp/recipient?phone_number=${encodeURIComponent(String(phone))}&user_id=${userId}`,
  });
  if (!chatResult.ok) return { ok: false, error: `Recipient with phone ${phone} not found. They must have messaged you first.` };
  const raw = Array.isArray(chatResult.data) ? chatResult.data[0] : chatResult.data;
  if (!raw || (Array.isArray(chatResult.data) && chatResult.data.length === 0)) {
    return { ok: false, error: `Recipient with phone ${phone} not found. They must have messaged you first.` };
  }
  return { ok: true, data: raw };
}

async function uploadFile(filePath, mimeType) {
  const baseUrl = process.env.NOTIFYER_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.NOTIFYER_API_TOKEN;
  const fileName = basename(filePath);
  const fileBuffer = readFileSync(filePath);

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append("file", blob, fileName);

  const response = await fetch(`${baseUrl}/api:bVXsw_FD/upload_file_by_attachment`, {
    method: "POST",
    headers: { Authorization: token, Origin: CHAT_ORIGIN },
    body: formData,
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!response.ok) {
    return { ok: false, error: `Upload failed (HTTP ${response.status})`, data };
  }
  if (data && data.success === false) {
    return { ok: false, error: data.message || "Upload rejected by API", data };
  }
  return { ok: true, data };
}

async function sendMedia(config, endpointType, body) {
  const baseUrl = process.env.NOTIFYER_API_BASE_URL?.replace(/\/$/, "");
  const token = process.env.NOTIFYER_API_TOKEN;

  const response = await fetch(`${baseUrl}/api:bVXsw_FD/web/send/${endpointType}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      Origin: CHAT_ORIGIN,
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

/**
 * Upload and send a single file. Returns a structured result object (does not call printJson).
 *
 * @param {{ config, currentRecipient, filePath, caption, scheduledTime, scheduleStr, pretty }} opts
 * @returns {Promise<{ ok: boolean, data?: any, error?: string, file?: string }>}
 */
async function processSingleFile({ config, currentRecipient, filePath, caption, scheduledTime, scheduleStr, pretty }) {
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext];
  if (!mimeType) {
    return {
      ok: false,
      file: filePath,
      error: `Unsupported file type: "${ext}". Allowed: ${Object.keys(MIME_MAP).join(", ")}.`,
    };
  }
  const endpointType = mimeToEndpoint(mimeType);

  if (pretty) process.stderr.write(`  Uploading ${basename(filePath)} (${mimeType})...\n`);
  const uploadResult = await uploadFile(filePath, mimeType);
  if (!uploadResult.ok) {
    return { ok: false, file: filePath, error: uploadResult.error };
  }

  const mediaLink =
    uploadResult.data?.file_url ??
    uploadResult.data?.url ??
    (typeof uploadResult.data === "string" ? uploadResult.data : null);
  if (!mediaLink || typeof mediaLink !== "string") {
    return { ok: false, file: filePath, error: "Upload succeeded but no file URL in response." };
  }

  if (pretty) process.stderr.write(`  → Uploaded: ${mediaLink}\n  Sending via /web/send/${endpointType}...\n`);

  const waPayload = buildWhatsAppMediaPayload(endpointType, mediaLink, filePath, caption);
  const sendBody = {
    media_link: mediaLink,
    mime_type: mimeType,
    caption,
    currentRecipient,
    scheduled_time: scheduledTime,
    ...waPayload,
  };

  const sendResult = await sendMedia(config, endpointType, sendBody);
  if (!sendResult.ok) {
    return { ok: false, file: filePath, error: sendResult.error };
  }

  const d = sendResult.data;
  if (d?.success === false) {
    return { ok: false, file: filePath, error: d.message || "API returned success: false" };
  }

  if (scheduledTime) {
    const schedCheck = validateScheduledSendResponse(d);
    if (!schedCheck.ok) {
      return { ok: false, file: filePath, error: schedCheck.message };
    }
  }

  return {
    ok: true,
    file: filePath,
    data: { media_link: mediaLink, mime_type: mimeType, media_type: endpointType, send_result: d },
  };
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const singleFile = getFlag(flags, "file");
  const multiFiles = getFlag(flags, "files");
  const captionFallback = getFlag(flags, "caption") ?? "";
  const captionsRaw = getFlag(flags, "captions");
  const scheduleStr = getFlag(flags, "schedule");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required. Provide phone number without + prefix (e.g. 14155550123)."));
    return;
  }
  if (!singleFile && !multiFiles) {
    printJson(err("--file or --files is required. Provide the path(s) to the file(s) to upload."));
    return;
  }
  if (singleFile && multiFiles) {
    printJson(err("Use either --file (single) or --files (multiple), not both."));
    return;
  }

  // Parse --captions early so we fail fast before any network calls
  let captionsArray = null;
  try {
    captionsArray = parseCaptionsFlag(captionsRaw);
  } catch (e) {
    printJson(err(e.message));
    return;
  }

  // Build the file list
  const rawPaths = multiFiles
    ? multiFiles.split(",").map((p) => p.trim()).filter(Boolean)
    : [singleFile];

  if (rawPaths.length > MAX_FILES) {
    printJson(err(`Too many files: ${rawPaths.length} provided, maximum is ${MAX_FILES}.`));
    return;
  }

  if (captionsArray !== null && captionsArray.length > rawPaths.length) {
    printJson(err(
      `--captions has ${captionsArray.length} entries but only ${rawPaths.length} file(s) provided. ` +
      `Each entry maps by position — extra entries are not allowed.`
    ));
    return;
  }

  // Validate all paths exist before doing any network calls
  for (const p of rawPaths) {
    if (!existsSync(p)) {
      printJson(err(`File not found or unreadable: ${p}`));
      return;
    }
  }

  const phone = parseInt(phoneRaw.replace(/^\+/, ""), 10);
  if (isNaN(phone)) {
    printJson(err("--phone must be a valid integer phone number."));
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

  if (pretty) process.stderr.write(`\nFetching recipient record for +${phone}...\n`);
  const recipientResult = await findRecipient(config, String(phone));
  if (!recipientResult.ok) {
    printJson(err(recipientResult.error));
    return;
  }
  const currentRecipient = recipientResult.data;

  // ── Single file (backwards-compatible path) ──────────────────────────────
  if (rawPaths.length === 1) {
    const filePath = rawPaths[0];
    const fileCaption = captionForFile(0, captionsArray, captionFallback);
    if (pretty) process.stderr.write(`Sending 1 file to +${phone}...\n`);
    const result = await processSingleFile({
      config, currentRecipient, filePath, caption: fileCaption, scheduledTime, scheduleStr, pretty,
    });
    if (!result.ok) {
      printJson(err(result.error));
      return;
    }
    if (pretty) {
      process.stderr.write(scheduledTime ? `\nMedia scheduled for ${scheduleStr}\n` : `\nMedia sent!\n`);
      process.stderr.write(`  To: +${phone}\n`);
      process.stderr.write(`  File: ${basename(filePath)} (${result.data.media_type})\n`);
      if (fileCaption) process.stderr.write(`  Caption: "${fileCaption}"\n`);
      process.stderr.write("\n");
    }
    printJson(ok({ ...result.data, caption: fileCaption }));
    return;
  }

  // ── Multiple files ────────────────────────────────────────────────────────
  if (pretty) {
    process.stderr.write(`\nSending ${rawPaths.length} files to +${phone}...\n`);
    if (captionsArray) {
      process.stderr.write(`  Per-file captions provided (${captionsArray.length} of ${rawPaths.length} positions)\n`);
    } else if (captionFallback) {
      process.stderr.write(`  Shared caption: "${captionFallback}"\n`);
    }
  }

  // Phase 1: Upload all files concurrently, UPLOAD_CONCURRENCY at a time
  if (pretty) process.stderr.write(`\nPhase 1 — Uploading ${rawPaths.length} files (${UPLOAD_CONCURRENCY} at a time)...\n`);

  const uploadResults = new Array(rawPaths.length);
  for (let i = 0; i < rawPaths.length; i += UPLOAD_CONCURRENCY) {
    const batch = rawPaths.slice(i, i + UPLOAD_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (filePath, batchIdx) => {
        const globalIdx = i + batchIdx;
        const ext = extname(filePath).toLowerCase();
        const mimeType = MIME_MAP[ext];
        if (!mimeType) {
          return { globalIdx, ok: false, filePath, error: `Unsupported type: "${ext}"` };
        }
        if (pretty) process.stderr.write(`  [${globalIdx + 1}/${rawPaths.length}] Uploading ${basename(filePath)}...\n`);
        const uploadResult = await uploadFile(filePath, mimeType);
        if (!uploadResult.ok) {
          return { globalIdx, ok: false, filePath, error: uploadResult.error };
        }
        const mediaLink =
          uploadResult.data?.file_url ??
          uploadResult.data?.url ??
          (typeof uploadResult.data === "string" ? uploadResult.data : null);
        if (!mediaLink) {
          return { globalIdx, ok: false, filePath, error: "Upload succeeded but no file URL returned." };
        }
        return { globalIdx, ok: true, filePath, mimeType, endpointType: mimeToEndpoint(mimeType), mediaLink };
      })
    );
    for (const outcome of outcomes) {
      uploadResults[outcome.globalIdx] = outcome;
    }
  }

  const uploadFailed = uploadResults.filter((r) => !r.ok);
  if (uploadFailed.length > 0 && pretty) {
    process.stderr.write(`\n  ${uploadFailed.length} upload(s) failed:\n`);
    uploadFailed.forEach((r) => process.stderr.write(`    ✗ ${basename(r.filePath)}: ${r.error}\n`));
  }

  const uploadSucceeded = uploadResults.filter((r) => r.ok);
  if (uploadSucceeded.length === 0) {
    printJson(err("All uploads failed. No files were sent.", uploadFailed.map((r) => ({ file: r.filePath, error: r.error }))));
    return;
  }

  // Phase 2: Send each uploaded file sequentially (matching frontend for loop)
  if (pretty) process.stderr.write(`\nPhase 2 — Sending ${uploadSucceeded.length} file(s) sequentially...\n`);

  const sent = [];
  const sendFailed = [...uploadFailed.map((r) => ({ file: r.filePath, error: r.error, stage: "upload" }))];

  for (const upload of uploadSucceeded) {
    const { filePath, mimeType, endpointType, mediaLink, globalIdx } = upload;
    const fileCaption = captionForFile(globalIdx, captionsArray, captionFallback);

    if (pretty) {
      const capLabel = fileCaption ? ` — caption: "${fileCaption}"` : " — no caption";
      process.stderr.write(`  Sending ${basename(filePath)} via /web/send/${endpointType}${capLabel}...\n`);
    }

    const waPayload = buildWhatsAppMediaPayload(endpointType, mediaLink, filePath, fileCaption);
    const sendBody = {
      media_link: mediaLink,
      mime_type: mimeType,
      caption: fileCaption,
      currentRecipient,
      scheduled_time: scheduledTime,
      ...waPayload,
    };

    const sendResult = await sendMedia(config, endpointType, sendBody);
    if (!sendResult.ok) {
      // Stop on first send failure — matches frontend behaviour
      sendFailed.push({ file: filePath, error: sendResult.error, stage: "send" });
      if (pretty) process.stderr.write(`  ✗ Send failed for ${basename(filePath)}: ${sendResult.error}\n`);
      break;
    }

    const d = sendResult.data;
    if (d?.success === false) {
      sendFailed.push({ file: filePath, error: d.message || "API returned success: false", stage: "send" });
      if (pretty) process.stderr.write(`  ✗ ${basename(filePath)}: API rejected\n`);
      break;
    }

    if (scheduledTime) {
      const schedCheck = validateScheduledSendResponse(d);
      if (!schedCheck.ok) {
        sendFailed.push({ file: filePath, error: schedCheck.message, stage: "send" });
        break;
      }
    }

    sent.push({ file: filePath, caption: fileCaption, media_link: mediaLink, mime_type: mimeType, media_type: endpointType });
    if (pretty) process.stderr.write(`  ✓ ${basename(filePath)}\n`);
  }

  if (pretty) {
    process.stderr.write(`\n${scheduledTime ? "Scheduled" : "Sent"}: ${sent.length}/${rawPaths.length} file(s)\n\n`);
  }

  const allOk = sendFailed.length === 0;
  if (!allOk) {
    printJson(err(
      `${sent.length} of ${rawPaths.length} file(s) sent. ${sendFailed.length} failed.`,
      { sent, failed: sendFailed },
      false
    ));
    return;
  }

  printJson(ok({ sent, failed: [], total: rawPaths.length, success_count: sent.length }));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
