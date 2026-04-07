#!/usr/bin/env node
/**
 * get-template.js — Retrieve a single template by name, template_id, or whatsapp_template_id.
 *
 * Internally calls GET /api:AFRA_QCy/templates_web and filters the result.
 * There is no dedicated GET-by-ID endpoint in the Notifyer API.
 *
 * Usage:
 *   node scripts/get-template.js --name order_confirmation
 *   node scripts/get-template.js --id tmpl_abc123
 *   node scripts/get-template.js --whatsapp-id 123456789
 *   node scripts/get-template.js --name order_confirmation --pretty
 *
 * Flags:
 *   --name <name>           Template name (exact match, case-insensitive)  (one required)
 *   --id <template_id>      Notifyer's internal template_id string          (one required)
 *   --whatsapp-id <num>     Meta's numeric whatsapp_template_id             (one required)
 *   --pretty                Print template details to stderr                (optional)
 *
 * Output (found):
 *   {
 *     "ok": true,
 *     "data": {
 *       "id": "abc123",
 *       "name": "order_confirmation",
 *       "template_id": "tmpl_...",
 *       "whatsapp_template_id": 123456789,
 *       "category": "MARKETING",
 *       "type": "text",
 *       "body": "Hello {{1}}, your order #{{2}} is confirmed.",
 *       "language": "en",
 *       "status": "approved",
 *       "components": [...]
 *     }
 *   }
 *
 * Output (not found):
 *   { "ok": false, "error": "Template 'foo' not found.", "data": null }
 *
 * Notes:
 *   - Uses console auth mode (Authorization: Bearer <token>).
 *   - To check if a template is usable for sending, verify status === "approved".
 *   - `components` contains the raw WhatsApp template definition with button configs,
 *     media header info, and per-variable example values.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function usage() {
  console.error(`
Usage:
  node scripts/get-template.js --name <name>
  node scripts/get-template.js --id <template_id>
  node scripts/get-template.js --whatsapp-id <num>

Flags:
  --name <name>         Template name (exact match, case-insensitive)
  --id <template_id>    Notifyer internal template_id string
  --whatsapp-id <num>   Meta's numeric whatsapp_template_id
  --pretty              Print details to stderr

Examples:
  node scripts/get-template.js --name order_confirmation
  node scripts/get-template.js --id tmpl_abc123
  node scripts/get-template.js --whatsapp-id 123456789
`);
  process.exit(1);
}

function printDetail(t) {
  process.stderr.write(`\nTemplate: ${t.name}\n`);
  process.stderr.write(`${"─".repeat(60)}\n`);
  process.stderr.write(`  template_id:          ${t.template_id ?? "(none)"}\n`);
  process.stderr.write(`  whatsapp_template_id: ${t.whatsapp_template_id ?? "(none)"}\n`);
  process.stderr.write(`  category:             ${t.category ?? ""}\n`);
  process.stderr.write(`  type:                 ${t.type ?? ""}\n`);
  process.stderr.write(`  language:             ${t.language ?? ""}\n`);
  process.stderr.write(`  status:               ${t.status ?? ""}\n`);
  if (t.body) {
    process.stderr.write(`  body:\n`);
    const lines = t.body.split("\n");
    for (const line of lines) {
      process.stderr.write(`    ${line}\n`);
    }
  }
  process.stderr.write("\n");
}

async function main() {
  const flags = parseArgs();
  const nameFilter = getFlag(flags, "name");
  const idFilter = getFlag(flags, "id");
  const whatsappIdFilter = getFlag(flags, "whatsapp-id");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!nameFilter && !idFilter && !whatsappIdFilter) {
    console.error(
      "Error: one of --name, --id, or --whatsapp-id is required.\n"
    );
    usage();
  }

  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "GET",
    path: "/api:AFRA_QCy/templates_web",
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  const templates = Array.isArray(result.data) ? result.data : [];

  let found = null;

  if (nameFilter) {
    found = templates.find(
      (t) => (t.name ?? "").toLowerCase() === nameFilter.toLowerCase()
    );
    if (!found) {
      printJson(
        err(`Template '${nameFilter}' not found.`, null, false, 404)
      );
    }
  } else if (idFilter) {
    found = templates.find((t) => t.template_id === idFilter);
    if (!found) {
      printJson(
        err(`Template with template_id '${idFilter}' not found.`, null, false, 404)
      );
    }
  } else if (whatsappIdFilter) {
    const numId = Number(whatsappIdFilter);
    found = templates.find((t) => t.whatsapp_template_id === numId);
    if (!found) {
      printJson(
        err(
          `Template with whatsapp_template_id '${whatsappIdFilter}' not found.`,
          null,
          false,
          404
        )
      );
    }
  }

  if (pretty && found) printDetail(found);

  printJson(ok(found));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
