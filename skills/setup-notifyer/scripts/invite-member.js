#!/usr/bin/env node
/**
 * invite-member.js — Create a new team member account on the workspace.
 *
 * POST /api:-4GSCDHb/auth/create_team_member
 *
 * IMPORTANT: Notifyer does NOT use email invitations. This creates a full account
 * immediately with the supplied credentials. You must share the email + password
 * with the new member out-of-band (e.g. over WhatsApp, email, or a password manager).
 *
 * Usage:
 *   node scripts/invite-member.js \
 *     --name "Jane Smith" \
 *     --email jane@company.com \
 *     --password "Secure@2024" \
 *     --role "Team Member"
 *
 *   # With label access (only for "Team Member" role):
 *   node scripts/invite-member.js \
 *     --name "Jane Smith" \
 *     --email jane@company.com \
 *     --password "Secure@2024" \
 *     --role "Team Member" \
 *     --labels "Sales,Support"
 *
 * Output (success):
 *   { "ok": true, "data": { "id": "uuid", "name": "...", "email": "...", "role": "...", ... } }
 *
 * Roles (assignable):
 *   "Admin"                   — Full settings + all labels access
 *   "Team Member (All Labels)" — Inbox access to all labels, no settings
 *   "Team Member"             — Inbox access to assigned labels only
 *   (Note: "Super Admin" is the account owner, cannot be assigned here)
 *
 * Labels:
 *   Only used when role is "Team Member". Comma-separated list of label names.
 *   Ignored for Admin and Team Member (All Labels) — those roles get all labels.
 *   Get available label names with: node scripts/list-members.js --labels
 *
 * Error: ERROR_CODE_ACCESS_DENIED — subscription is canceled; upgrade required.
 * Cost: $12/seat/month for seats beyond the plan's included_seats.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const VALID_ROLES = ["Admin", "Team Member", "Team Member (All Labels)"];

function usage() {
  console.error(`
Usage:
  node scripts/invite-member.js --name <name> --email <email> --password <password> --role <role> [--labels <label1,label2>]

Required flags:
  --name      Full name of the new team member
  --email     Email address (used to log in)
  --password  Account password (share out-of-band; cannot be retrieved later)
  --role      One of: Admin | "Team Member" | "Team Member (All Labels)"

Optional flags:
  --labels    Comma-separated label names, only for "Team Member" role
  --pretty    Print summary to stderr

Environment:
  NOTIFYER_API_BASE_URL   required
  NOTIFYER_API_TOKEN      required
`);
  process.exit(1);
}

async function main() {
  const flags = parseArgs();
  const name = getFlag(flags, "name");
  const email = getFlag(flags, "email");
  const password = getFlag(flags, "password");
  const role = getFlag(flags, "role") ?? "Team Member";
  const labelsRaw = getFlag(flags, "labels");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!name || !email || !password) {
    console.error("Error: --name, --email, and --password are required.");
    usage();
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Error: --role must be one of: ${VALID_ROLES.map((r) => `"${r}"`).join(", ")}`);
    usage();
  }

  // Validate name length
  if (name.length < 3) {
    printJson(err("Name must be at least 3 characters.", null, true));
  }
  if (name.length > 120) {
    printJson(err("Name must be at most 120 characters.", null, true));
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    printJson(err("Invalid email format.", null, true));
  }

  // Build labels array — only relevant for "Team Member" role
  const labels =
    role === "Team Member" && labelsRaw
      ? labelsRaw.split(",").map((l) => l.trim()).filter(Boolean)
      : [];

  if (pretty) {
    process.stderr.write(`\nCreating team member:\n`);
    process.stderr.write(`  Name:   ${name}\n`);
    process.stderr.write(`  Email:  ${email}\n`);
    process.stderr.write(`  Role:   ${role}\n`);
    process.stderr.write(
      `  Labels: ${role === "Team Member" ? (labels.length ? labels.join(", ") : "none") : "All (automatic)"}\n\n`
    );
  }

  const config = loadConfig({ requireToken: true });

  const result = await requestJson(config, {
    method: "POST",
    path: "/api:-4GSCDHb/auth/create_team_member",
    body: {
      name,
      email: email.toLowerCase(),
      password,
      role,
      labels,
    },
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  // Surface Xano ACCESS_DENIED as a blocked error
  if (result.data?.code === "ERROR_CODE_ACCESS_DENIED") {
    printJson(
      err(
        result.data.message || "Cannot create team member — subscription canceled or seat limit reached.",
        result.data,
        true
      )
    );
  }

  if (pretty) {
    process.stderr.write(`✓ Team member created successfully.\n`);
    process.stderr.write(`  ID: ${result.data?.id ?? "unknown"}\n`);
    process.stderr.write(`  Share these credentials with ${name} out-of-band.\n\n`);
  }

  printJson(ok(result.data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
