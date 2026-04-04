#!/usr/bin/env node
/**
 * get-api-key.js — Retrieve the workspace Developer API key.
 *
 * GET /api:-4GSCDHb/api_key
 *
 * Usage:
 *   node scripts/get-api-key.js
 *   node scripts/get-api-key.js --pretty   # prints key to stderr for easy copying
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": {
 *       "api_key": "ey...",
 *       "id": 1,
 *       "user_id": "uuid",
 *       "created_at": 1700000000000
 *     }
 *   }
 *
 * Notes:
 *   - The returned `api_key` value is the Developer API key used to authenticate
 *     against the Notifyer external/developer API surface (Make, Zapier, n8n, etc.).
 *   - This key is sent as a raw `Authorization` header (no "Bearer" prefix) when
 *     calling developer-facing endpoints such as:
 *       POST /api:hFrjh8a1/send_template_message_by_api
 *     It is DIFFERENT from the console JWT (NOTIFYER_API_TOKEN).
 *   - Uses console auth mode (Authorization: Bearer <token>) to fetch the key.
 *     The console JWT authenticates the request; the returned api_key is what
 *     third-party tools (Make, Zapier, n8n) use.
 *   - The API key is fixed per workspace — there is no rotate/regenerate endpoint.
 *   - Plan requirement: The API key is retrievable for any plan, but USING it with
 *     Make/Zapier/n8n/developer calls requires a Pro or Agency plan. Basic (Bulk
 *     Message) plan accounts are blocked in the console from using the API key.
 *     Check eligibility: node scripts/get-user-plan.js --pretty
 *   - When configuring Make/Zapier/n8n: use the "Notifyer Systems" module, NOT the
 *     "WhatsAble" module. The console shows an explicit warning about this.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

async function main() {
  const flags = parseArgs();
  const pretty = getBooleanFlag(flags, "pretty");

  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:-4GSCDHb/api_key",
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  if (pretty) {
    const key = result.data?.api_key ?? "(not found)";
    process.stderr.write(`\nDeveloper API Key\n`);
    process.stderr.write(`${"─".repeat(60)}\n`);
    process.stderr.write(`${key}\n`);
    process.stderr.write(`\nUse as: Authorization: ${key}\n`);
    process.stderr.write(`(raw value, no "Bearer" prefix)\n\n`);
  }

  printJson(ok(result.data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
