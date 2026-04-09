#!/usr/bin/env node
/**
 * send-template.js — Send a WhatsApp template message to a recipient.
 *
 * POST /api:bVXsw_FD/web/send/template
 *
 * Use this when:
 *   - The 24h messaging window is closed (expiration_timestamp null or past)
 *   - You want to initiate a new conversation
 *   - You want to send a scheduled marketing/transactional message
 *
 * Usage:
 *   node scripts/send-template.js --phone 14155550123 --template tmpl_abc123
 *   node scripts/send-template.js --phone 14155550123 --template tmpl_abc123 --variables '{"body1":"John","body2":"#12345"}'
 *   node scripts/send-template.js --phone 14155550123 --template tmpl_abc123 --schedule "25/01/2025 14:00"
 *
 * Required Flags:
 *   --phone <number>         Recipient phone number WITHOUT + prefix (integer).
 *   --template <template_id> Notifyer template_id string (from list-templates.js).
 *                            NOT the template name — use the template_id field.
 *
 * Optional Flags:
 *   --variables <json>       Template variable values as JSON object.
 *                            Keys: body1, body2, body3 (for {{1}}, {{2}}, {{3}} in body)
 *                                  m_1 (for image/video/document header media URL)
 *                                  visit_website (for button URL variable)
 *                            Example: '{"body1":"John","body2":"#12345"}'
 *   --schedule <time>        Schedule the message: "DD/MM/YYYY HH:mm"
 *                            When set, Xano adds to chat_schedule (no immediate send).
 *                            scheduled_time == 0 means immediate; non-zero means scheduled.
 *   --pretty                 Print summary to stderr.
 *
 * Output (success):
 *   { "ok": true, "data": { "success": true, "message_id": "...", ... } }
 *
 * Side effects on success:
 *   - If recipient doesn't exist, Xano auto-creates them (/recipient_create)
 *   - Logs to success_messaging_templates, conversation, log tables
 *   - Updates subscriber_packages (billing/usage tracking)
 *   - Fires /send_outgoing_message_by_webhook if webhooks are configured
 *
 * CORS: Xano runs /cors_origin_web_chat on this endpoint.
 *   Script sends Origin: https://chat.notifyer-systems.com automatically.
 *
 * Template lookup: Xano looks up the template from its template_request table
 *   using the template_id string. Get the template_id from:
 *   node ../automate-notifyer/scripts/list-templates.js --pretty
 *
 * Variables format: Xano reads variables from the payload and passes them to
 *   the template dynamic data builder. Supported variable keys:
 *   body1, body2, body3, m_1, visit_website, button_dynamic_url_value
 *
 * Scheduling: Xano checks scheduled_time != 0. Sending 0 = immediate send.
 *   The script sends 0 when --schedule is not provided.
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

function parseDateDDMMYYYY(str) {
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00`);
  return isNaN(d.getTime()) ? null : d.getTime();
}

async function main() {
  const flags = parseArgs();
  const phoneRaw = getFlag(flags, "phone");
  const templateId = getFlag(flags, "template");
  const variablesRaw = getFlag(flags, "variables");
  const scheduleStr = getFlag(flags, "schedule");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!phoneRaw) {
    printJson(err("--phone is required. Provide phone number without + prefix (e.g. 14155550123)."));
    return;
  }
  if (!templateId) {
    printJson(err("--template is required. Provide the template_id string (from list-templates.js)."));
    return;
  }

  const phone = parseInt(phoneRaw.replace(/^\+/, ""), 10);
  if (isNaN(phone)) {
    printJson(err("--phone must be a valid integer phone number."));
    return;
  }

  let variables = {};
  if (variablesRaw) {
    try {
      variables = JSON.parse(variablesRaw);
    } catch {
      printJson(err("--variables must be valid JSON (e.g. '{\"body1\":\"John\"}')."));
      return;
    }
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

  // Xano reads the entire body as _self/payload via Get All Input.
  // current_recipient must be an object with phone_number (integer).
  // scheduled_time: 0 = immediate, non-zero = scheduled.
  const body = {
    template: templateId,
    variables,
    current_recipient: { phone_number: phone },
    scheduled_time: scheduledTime,
  };

  const result = await requestJson(config, {
    method: "POST",
    path: "/api:bVXsw_FD/web/send/template",
    body,
    extraHeaders: { Origin: CHAT_ORIGIN },
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
    return;
  }

  const d = result.data;

  // Check for business_logic failure (Xano returns HTTP 200 with success: false)
  if (d && d.success === false) {
    const msg = d.message
      || d.whatsapp_response_info?.error_user_msg
      || d.whatsapp_response_info?.error_data?.details
      || "Template message failed";
    printJson(err(msg, d, false));
    return;
  }

  if (pretty) {
    if (scheduledTime) {
      process.stderr.write(`\nTemplate message scheduled for ${scheduleStr}\n`);
    } else {
      process.stderr.write(`\nTemplate message sent!\n`);
    }
    process.stderr.write(`  To: +${phone}\n`);
    process.stderr.write(`  Template ID: ${templateId}\n`);
    if (Object.keys(variables).length > 0) {
      process.stderr.write(`  Variables: ${JSON.stringify(variables)}\n`);
    }
    process.stderr.write(`  Success: ${d?.success ?? "unknown"}\n\n`);
  }

  printJson(ok(result.data));
}

main().catch((e) => { printJson(err(`Unexpected error: ${e.message}`)); });
