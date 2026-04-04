#!/usr/bin/env node
/**
 * get-me.js — Retrieve the authenticated user's profile.
 *
 * GET /api:-4GSCDHb/auth/me
 *
 * Usage:
 *   node scripts/get-me.js
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": 1,
 *       "name": "Jane Smith",
 *       "email": "jane@company.com",
 *       "role": "Admin",
 *       "phone_number": 14155550123,
 *       "created_at": 1680000000000,
 *       ...
 *     }
 *   }
 *
 * Output (failure):
 *   { "ok": false, "error": "...", "blocked": false }
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (JWT from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { ok, err, printJson } from "./lib/result.js";

async function main() {
  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:-4GSCDHb/auth/me",
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  printJson(ok(result.data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
