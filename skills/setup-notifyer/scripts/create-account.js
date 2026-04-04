#!/usr/bin/env node
/**
 * create-account.js — Create a new Notifyer account.
 *
 * POST /api:-4GSCDHb/auth/signup
 *
 * Usage:
 *   node scripts/create-account.js \
 *     --name "Jane Smith" \
 *     --email jane@company.com \
 *     --password "Secure@123" \
 *     --phone 14155550123 \
 *     --reason "Automate customer support"
 *
 * Output (success):
 *   { "ok": true, "data": { "authToken": "...", "user": { ... }, ... } }
 *
 * Output (failure):
 *   { "ok": false, "error": "...", "blocked": false }
 *
 * Notes:
 *   - phone must be a number including country code (no +, spaces, or dashes)
 *   - password must be ≥8 chars with uppercase, lowercase, number, special char
 *   - email is automatically lowercased before sending
 *   - does NOT require NOTIFYER_API_TOKEN (unauthenticated call)
 *   - on success, the returned authToken can be used immediately as NOTIFYER_API_TOKEN
 *   - signup auto-creates: user, api_key, subscriber_packages records
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getNumberFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function usage() {
  console.error(`
Usage:
  node scripts/create-account.js \\
    --name <full-name> \\
    --email <email> \\
    --password <password> \\
    --phone <phone-number-with-country-code> \\
    --reason <reason-for-automation>

Flags:
  --name      Full name of the account owner (required)
  --email     Email address (required, auto-lowercased)
  --password  Password (required, ≥8 chars, mixed case + number + special char)
  --phone     Phone number as integer including country code, no +/spaces (required)
              e.g. 14155550123  (US +1 415 555 0123)
  --reason    Why you want to automate with WhatsApp (optional)

Environment:
  NOTIFYER_API_BASE_URL   API base URL (required)

Example:
  export NOTIFYER_API_BASE_URL=https://api.insightssystem.com
  node scripts/create-account.js \\
    --name "Jane Smith" \\
    --email jane@company.com \\
    --password "Secure@123" \\
    --phone 14155550123 \\
    --reason "Automate customer support notifications"
`);
  process.exit(1);
}

function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push("at least 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("at least one uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("at least one lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("at least one number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("at least one special character (e.g. @!#$%^&*)");
  return errors;
}

async function main() {
  const flags = parseArgs();

  const name = getFlag(flags, "name");
  const email = getFlag(flags, "email");
  const password = getFlag(flags, "password");
  const phone = getNumberFlag(flags, "phone");
  const reason = getFlag(flags, "reason");

  if (!name || !email || !password || phone === undefined) {
    console.error("Error: --name, --email, --password, and --phone are all required.\n");
    usage();
  }

  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    printJson(err(
      `Password does not meet requirements: ${passwordErrors.join(", ")}`,
      { requirements: passwordErrors },
      true
    ));
  }

  const config = loadConfig({ requireToken: false });

  const result = await requestJson(config, {
    method: "POST",
    path: "/api:-4GSCDHb/auth/signup",
    body: {
      name,
      email: email.toLowerCase(),
      password,
      phone_number: phone,
      reason_of_automate: reason ?? "",
    },
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  printJson(ok(result.data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
