#!/usr/bin/env node
/**
 * login.js — Login to Notifyer and retrieve an auth token.
 *
 * POST /api:-4GSCDHb/auth/login
 *
 * Usage:
 *   node scripts/login.js --email you@example.com --password "Secure@123"
 *
 * Output (success):
 *   { "ok": true, "data": { "authToken": "eyJ..." } }
 *
 * Output (failure):
 *   { "ok": false, "error": "...", "blocked": false }
 *
 * After success:
 *   export NOTIFYER_API_TOKEN=<authToken>
 *
 * Notes:
 *   - Always sends Origin: https://console.notifyer-systems.com
 *     This is required by the Xano login function stack — Admin and Super Admin
 *     users are validated against this origin header. Regular users are unaffected.
 *   - Does NOT require NOTIFYER_API_TOKEN (unauthenticated call).
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function usage() {
  console.error(`
Usage:
  node scripts/login.js --email <email> --password <password>

Flags:
  --email     Your Notifyer account email (required)
  --password  Your Notifyer account password (required)

Environment:
  NOTIFYER_API_BASE_URL   API base URL (required)

After login, export the token:
  export NOTIFYER_API_TOKEN=<authToken from output>
`);
  process.exit(1);
}

async function main() {
  const flags = parseArgs();
  const email = getFlag(flags, "email");
  const password = getFlag(flags, "password");

  if (!email || !password) {
    console.error("Error: --email and --password are required.\n");
    usage();
  }

  const config = loadConfig({ requireToken: false });

  const result = await requestJson(config, {
    method: "POST",
    path: "/api:-4GSCDHb/auth/login",
    body: {
      email: email.toLowerCase(),
      password,
    },
    // Required: Xano reads $http_headers.Origin to validate Admin/Super Admin roles.
    // Always include this header so login works correctly regardless of user role.
    extraHeaders: {
      Origin: "https://console.notifyer-systems.com",
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
