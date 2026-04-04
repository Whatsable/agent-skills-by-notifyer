#!/usr/bin/env node
/**
 * refresh-connection.js — Force a re-sync of WhatsApp registration and subscription with Meta.
 *
 * POST /api:P5grzx1u/refresher_of_registration_subscription
 *
 * Usage:
 *   node scripts/refresh-connection.js
 *   node scripts/refresh-connection.js --pretty  # human-readable summary to stderr
 *
 * When to use:
 *   - After connecting a WhatsApp number via the Notifyer console
 *   - When get-connection-status.js shows a stale or failed registration/subscription
 *   - When the console UI "Refresh" button would be clicked
 *
 * This endpoint re-triggers Notifyer's registration and subscription calls to Meta's
 * WhatsApp Business API. It returns the same shape as get-connection-status.js.
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "isConnected": true,
 *       "has_embedded_user": true,
 *       "registration": { "success": true, ... },
 *       "subscription": { "success": true, ... },
 *       "payment_method_added": false,
 *       "is_template_has": false,
 *       "is_message_tested": false,
 *       "is_profile_picture_added": false,
 *       "onboarding_steps_completed": 1
 *     }
 *   }
 *
 * Note: Meta may impose daily limits on re-registration attempts. If the console
 * shows a "Daily Limit Warning", wait 24 hours before calling this script again.
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

function printSummary(data) {
  const isConnected = !!(data.registration?.success && data.subscription?.success);
  const steps = countOnboardingSteps(data);
  const check = (v) => (v ? "✓" : "○");

  process.stderr.write(`
Refreshed WhatsApp Connection Status
─────────────────────────────────────
  Connected (registration + subscription): ${isConnected ? "YES ✓" : "NO ✗"}
  Phone linked to Meta account:            ${data.has_embedded_user ? "YES ✓" : "NO ✗"}

Onboarding Steps (${steps}/5 complete)
  ${check(isConnected)} Connect with Meta account
  ${check(data.payment_method_added)} Add payment method in Facebook
  ${check(data.is_template_has)} Create first template
  ${check(data.is_message_tested)} Send a test message
  ${check(data.is_profile_picture_added)} Add profile picture to WhatsApp
`);

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
    method: "POST",
    path: "/api:P5grzx1u/refresher_of_registration_subscription",
    body: {},
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  const raw = result.data;
  const enriched = {
    isConnected: !!(raw.registration?.success && raw.subscription?.success),
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
