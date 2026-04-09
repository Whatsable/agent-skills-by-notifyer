#!/usr/bin/env node
/**
 * doctor.js — Pre-flight health check for Notifyer agent operations.
 *
 * Validates every prerequisite an AI agent needs before running any other script:
 *   1. NOTIFYER_API_BASE_URL   — set, starts with https://, host is reachable
 *   2. NOTIFYER_API_TOKEN      — set, accepted by /auth/me (token valid, not expired)
 *   3. WhatsApp connection      — registration + subscription active (isConnected: true)
 *   4. Degraded Meta state      — connected but Meta has returned hidden errors
 *   5. Plan status              — subscription is active (not canceled or missing)
 *
 * Usage:
 *   node scripts/doctor.js           # structured JSON output (machine-readable)
 *   node scripts/doctor.js --pretty  # human-readable report to stderr + JSON to stdout
 *
 * Output (all checks pass):
 *   {
 *     "ok": true,
 *     "data": {
 *       "all_healthy": true,
 *       "checks": {
 *         "base_url":    { "pass": true },
 *         "token":       { "pass": true, "user": "Jane Smith <jane@co.com>", "role": "Admin" },
 *         "connection":  { "pass": true, "degraded": false },
 *         "plan":        { "pass": true, "status": "active", "contacts_used": 42, "contacts_limit": 500 }
 *       }
 *     }
 *   }
 *
 * Output (one or more checks fail):
 *   {
 *     "ok": false,
 *     "error": "1 check(s) failed — see data.checks for details",
 *     "blocked": false,
 *     "data": {
 *       "all_healthy": false,
 *       "checks": {
 *         "base_url":   { "pass": true },
 *         "token":      { "pass": false, "error": "Token expired — re-run login.js", "fix": "node scripts/login.js --email ... --password ..." },
 *         "connection": { "pass": false, "error": "WhatsApp not connected", "fix": "Open console.notifyer-systems.com and complete the WhatsApp connection." },
 *         "plan":       { "pass": false, "error": "Plan status: canceled", "fix": "Upgrade the plan at console.notifyer-systems.com." }
 *       }
 *     }
 *   }
 *
 * Run this script before any other script when debugging unexpected failures.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const ACTIVE_PLAN_STATUSES = new Set(["active", "trialing", "new_user"]);

function printReport(checks, allHealthy) {
  const pass = (v) => (v ? "PASS ✓" : "FAIL ✗");
  const t = checks;

  process.stderr.write(`
Notifyer Doctor — Pre-flight Health Check
──────────────────────────────────────────
`);

  // Base URL
  process.stderr.write(`  ${pass(t.base_url.pass)}  Base URL (${process.env.NOTIFYER_API_BASE_URL})\n`);
  if (!t.base_url.pass) process.stderr.write(`         → ${t.base_url.fix}\n`);

  // Token
  if (t.token.pass) {
    process.stderr.write(`  ${pass(true)}  Token valid — ${t.token.user} (${t.token.role})\n`);
  } else {
    process.stderr.write(`  ${pass(false)}  Token — ${t.token.error}\n`);
    process.stderr.write(`         → ${t.token.fix}\n`);
  }

  // Connection
  if (t.connection.pass && !t.connection.degraded) {
    process.stderr.write(`  ${pass(true)}  WhatsApp connected\n`);
  } else if (t.connection.pass && t.connection.degraded) {
    process.stderr.write(`  WARN ⚠  WhatsApp connected but DEGRADED — Meta returned hidden errors\n`);
    if (t.connection.meta_errors?.length) {
      for (const e of t.connection.meta_errors) {
        process.stderr.write(`         • ${e}\n`);
      }
    }
    process.stderr.write(`         → Check console.notifyer-systems.com for remediation.\n`);
  } else {
    process.stderr.write(`  ${pass(false)}  WhatsApp connection — ${t.connection.error}\n`);
    process.stderr.write(`         → ${t.connection.fix}\n`);
  }

  // Plan
  if (t.plan.pass) {
    process.stderr.write(
      `  ${pass(true)}  Plan active (${t.plan.status}) — ` +
        `${t.plan.contacts_used}/${t.plan.contacts_limit} contacts used\n`
    );
  } else {
    process.stderr.write(`  ${pass(false)}  Plan — ${t.plan.error}\n`);
    process.stderr.write(`         → ${t.plan.fix}\n`);
  }

  process.stderr.write(`\n  Overall: ${allHealthy ? "All checks passed ✓" : "Action required ✗"}\n\n`);
}

async function main() {
  const flags = parseArgs();
  const pretty = getBooleanFlag(flags, "pretty");

  const checks = {};
  let failCount = 0;

  // ── Check 1: base URL ─────────────────────────────────────────────────────
  const baseUrl = process.env.NOTIFYER_API_BASE_URL;
  if (!baseUrl) {
    checks.base_url = {
      pass: false,
      error: "NOTIFYER_API_BASE_URL is not set",
      fix: "export NOTIFYER_API_BASE_URL=https://api.insightssystem.com",
    };
    failCount++;
  } else if (!baseUrl.startsWith("https://")) {
    checks.base_url = {
      pass: false,
      error: `NOTIFYER_API_BASE_URL must start with https:// — current: ${baseUrl}`,
      fix: "export NOTIFYER_API_BASE_URL=https://api.insightssystem.com",
    };
    failCount++;
  } else {
    checks.base_url = { pass: true };
  }

  // If base URL is broken, remaining checks can't run — report early.
  if (!checks.base_url.pass) {
    checks.token = { pass: false, error: "Skipped — fix base_url first" };
    checks.connection = { pass: false, error: "Skipped — fix base_url first" };
    checks.plan = { pass: false, error: "Skipped — fix base_url first" };
    failCount += 3;
    const allHealthy = false;
    if (pretty) printReport(checks, allHealthy);
    printJson(
      err(`${failCount} check(s) failed — see data.checks for details`, {
        all_healthy: allHealthy,
        checks,
      })
    );
    return;
  }

  // ── Checks 2-4 require a token ────────────────────────────────────────────
  // We call loadConfig without process.exit on missing token so we can surface
  // a friendlier message ourselves.
  const tokenEnv = process.env.NOTIFYER_API_TOKEN;
  if (!tokenEnv) {
    checks.token = {
      pass: false,
      error: "NOTIFYER_API_TOKEN is not set",
      fix: "node scripts/login.js --email you@example.com --password yourpassword\nthen: export NOTIFYER_API_TOKEN=<authToken>",
    };
    checks.connection = { pass: false, error: "Skipped — fix token first" };
    checks.plan = { pass: false, error: "Skipped — fix token first" };
    failCount += 3;
    const allHealthy = false;
    if (pretty) printReport(checks, allHealthy);
    printJson(
      err(`${failCount} check(s) failed — see data.checks for details`, {
        all_healthy: allHealthy,
        checks,
      })
    );
    return;
  }

  const config = loadConfig({ requireToken: true });

  // ── Check 2: token ────────────────────────────────────────────────────────
  const meResult = await requestJson(config, {
    method: "GET",
    path: "/api:-4GSCDHb/auth/me",
  });

  if (!meResult.ok) {
    checks.token = {
      pass: false,
      error: meResult.status === 401
        ? "Token expired or invalid"
        : meResult.error,
      fix: "node scripts/login.js --email you@example.com --password yourpassword\nthen: export NOTIFYER_API_TOKEN=<authToken>",
    };
    failCount++;
  } else {
    const user = meResult.data;
    checks.token = {
      pass: true,
      user: `${user.name} <${user.email}>`,
      role: user.role ?? "unknown",
    };
  }

  // ── Check 3: WhatsApp connection ──────────────────────────────────────────
  const connResult = await requestJson(config, {
    method: "GET",
    path: "/api:P5grzx1u/is_user_embedded",
  });

  if (!connResult.ok) {
    checks.connection = {
      pass: false,
      error: connResult.error,
      fix: "Check NOTIFYER_API_BASE_URL and token, then retry.",
    };
    failCount++;
  } else {
    const raw = connResult.data;
    const isConnected = !!(
      raw.registration?.success && raw.subscription?.success
    );
    const metaErrors = [];
    for (const [key, block] of [["registration", raw.registration], ["subscription", raw.subscription]]) {
      const wares = block?.whatsapp_response?.error;
      if (wares) {
        const detail = wares.error_data?.details || wares.message || JSON.stringify(wares);
        metaErrors.push(`${key}: ${detail}`);
      }
    }
    const degraded = isConnected && metaErrors.length > 0;

    if (!isConnected) {
      checks.connection = {
        pass: false,
        error: "WhatsApp not connected (registration or subscription inactive)",
        fix: "Open console.notifyer-systems.com and complete the WhatsApp connection flow.",
      };
      failCount++;
    } else {
      checks.connection = {
        pass: true,
        degraded,
        meta_errors: metaErrors,
      };
      // Degraded is a warning — still a passing check, but surfaces the issue.
    }
  }

  // ── Check 4: plan status ──────────────────────────────────────────────────
  const planResult = await requestJson(config, {
    method: "GET",
    path: "/api:JZAUyiCs/user_plan",
  });

  if (!planResult.ok) {
    checks.plan = {
      pass: false,
      error: planResult.error,
      fix: "Check NOTIFYER_API_BASE_URL and token, then retry.",
    };
    failCount++;
  } else {
    const planData = planResult.data;
    const plan = planData.latest_plan;
    const status = plan?.status ?? "none";
    const contactsUsed = planData.usages ?? 0;
    const contactsLimit = plan?.unique_number_limit ?? 0;

    if (!plan || !ACTIVE_PLAN_STATUSES.has(status)) {
      checks.plan = {
        pass: false,
        error: `Plan status: ${status} — messaging is not available`,
        fix: "Upgrade or reactivate the plan at console.notifyer-systems.com.",
      };
      failCount++;
    } else {
      checks.plan = {
        pass: true,
        status,
        contacts_used: contactsUsed,
        contacts_limit: contactsLimit,
      };
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const allHealthy = failCount === 0;

  if (pretty) printReport(checks, allHealthy);

  const summary = { all_healthy: allHealthy, checks };

  if (!allHealthy) {
    printJson(
      err(
        `${failCount} check(s) failed — see data.checks for details`,
        summary
      )
    );
  } else {
    printJson(ok(summary));
  }
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
