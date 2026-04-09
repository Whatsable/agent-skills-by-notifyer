#!/usr/bin/env node
/**
 * get-connection-status.js — Get the WhatsApp connection status for this account.
 *
 * GET /api:P5grzx1u/is_user_embedded
 *
 * Usage:
 *   node scripts/get-connection-status.js
 *   node scripts/get-connection-status.js --json    # raw JSON only (default)
 *   node scripts/get-connection-status.js --pretty  # human-readable summary to stderr
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "isConnected": true,
 *       "degraded": false,
 *       "meta_errors": [],
 *       "has_embedded_user": true,
 *       "registration": { "success": true, "message": "...", "whatsapp_response": {...} },
 *       "subscription": { "success": true, "message": "...", "whatsapp_response": {...} },
 *       "payment_method_added": false,
 *       "is_template_has": false,
 *       "is_message_tested": false,
 *       "is_profile_picture_added": false,
 *       "onboarding_steps_completed": 1
 *     }
 *   }
 *
 * isConnected = registration.success AND subscription.success.
 * A connected number is ready to send messages.
 *
 * degraded = true when isConnected is true but Meta has returned an error inside the
 * whatsapp_response payload (e.g. two-step PIN mismatch, account restricted). This can
 * happen because Xano returns success: true even when the underlying Meta call failed.
 * Always check degraded before assuming the connection is fully healthy.
 *
 * meta_errors = array of error detail strings extracted from the whatsapp_response payload.
 *
 * has_embedded_user = phone number is linked to a Meta/Facebook account.
 * This can be true even if registration or subscription has errors.
 *
 * Onboarding checklist (5 steps):
 *   1. registration.success && subscription.success  → Connect with Meta account
 *   2. payment_method_added                          → Add payment method in Facebook
 *   3. is_template_has                               → Create first template
 *   4. is_message_tested                             → Send a test message
 *   5. is_profile_picture_added                      → Add profile picture to WhatsApp
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function countOnboardingSteps(data) {
  let completed = 0;
  if (data.registration?.success && data.subscription?.success) completed++;
  if (data.payment_method_added) completed++;
  if (data.is_template_has) completed++;
  if (data.is_message_tested) completed++;
  if (data.is_profile_picture_added) completed++;
  return completed;
}

/**
 * Extract Meta error details from a registration or subscription block.
 * Xano can return success: true while the whatsapp_response contains an error
 * (e.g. two-step PIN mismatch, account restricted). We surface these as degraded.
 *
 * @param {object|null} block  registration or subscription object
 * @param {string} label       "registration" or "subscription"
 * @returns {string[]}
 */
function extractMetaErrors(block, label) {
  if (!block) return [];
  const errors = [];
  const wares = block.whatsapp_response?.error;
  if (wares) {
    const detail =
      wares.error_data?.details ||
      wares.message ||
      JSON.stringify(wares);
    errors.push(`${label}: ${detail}`);
  }
  return errors;
}

function printSummary(data) {
  const check = (v) => (v ? "✓" : "○");
  const degradedLabel = data.degraded ? " ⚠ DEGRADED" : "";

  process.stderr.write(`
WhatsApp Connection Status
─────────────────────────
  Connected (registration + subscription): ${data.isConnected ? `YES ✓${degradedLabel}` : "NO ✗"}
  Phone linked to Meta account:            ${data.has_embedded_user ? "YES ✓" : "NO ✗"}

Onboarding Steps (${data.onboarding_steps_completed}/5 complete)
  ${check(data.isConnected)} Connect with Meta account
  ${check(data.payment_method_added)} Add payment method in Facebook
  ${check(data.is_template_has)} Create first template
  ${check(data.is_message_tested)} Send a test message
  ${check(data.is_profile_picture_added)} Add profile picture to WhatsApp
`);

  if (data.degraded && data.meta_errors.length > 0) {
    process.stderr.write(
      "  ⚠ Meta reported errors despite success:true:\n"
    );
    for (const e of data.meta_errors) {
      process.stderr.write(`    • ${e}\n`);
    }
    process.stderr.write(
      "  → Connection may be degraded. Check the Notifyer console for remediation steps.\n"
    );
  }

  if (data.registration && !data.registration.success) {
    const detail =
      data.registration.whatsapp_response?.error?.error_data?.details ||
      data.registration.whatsapp_response?.error?.message ||
      data.registration.message;
    process.stderr.write(`  ⚠ Registration error: ${detail}\n`);
  }

  if (data.subscription && !data.subscription.success) {
    const detail =
      data.subscription.whatsapp_response?.error?.error_data?.details ||
      data.subscription.whatsapp_response?.error?.message ||
      data.subscription.message;
    process.stderr.write(`  ⚠ Subscription error: ${detail}\n`);
  }

  process.stderr.write("\n");
}

async function main() {
  const flags = parseArgs();
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:P5grzx1u/is_user_embedded",
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  const raw = result.data;

  const isConnected = !!(raw.registration?.success && raw.subscription?.success);

  // Detect hidden Meta errors: Xano can return success:true while the underlying
  // whatsapp_response contains an error (e.g. two-step PIN mismatch).
  const metaErrors = [
    ...extractMetaErrors(raw.registration, "registration"),
    ...extractMetaErrors(raw.subscription, "subscription"),
  ];
  const degraded = isConnected && metaErrors.length > 0;

  const enriched = {
    isConnected,
    degraded,
    meta_errors: metaErrors,
    has_embedded_user: raw.has_embedded_user ?? false,
    registration: raw.registration ?? null,
    subscription: raw.subscription ?? null,
    payment_method_added: raw.payment_method_added || false,
    is_template_has: raw.is_template_has || false,
    is_message_tested: raw.is_message_tested || false,
    is_profile_picture_added: raw.is_profile_picture_added || false,
    onboarding_steps_completed: countOnboardingSteps(raw),
  };

  if (pretty) {
    printSummary(enriched);
  }

  printJson(ok(enriched));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
