#!/usr/bin/env node
/**
 * remove-member.js — Permanently remove a team member from the workspace.
 *
 * DELETE /api:-4GSCDHb/auth/delete_team_member/:id
 *
 * Usage:
 *   node scripts/remove-member.js --id <member-id>
 *   node scripts/remove-member.js --id <member-id> --confirm
 *
 * Output (success):
 *   { "ok": true, "data": { "removed_id": "<id>" } }
 *
 * IMPORTANT:
 *   - This is irreversible. The member's account is deleted immediately.
 *   - Super Admin (the account owner) cannot be removed.
 *   - The --confirm flag bypasses the safety prompt in non-interactive use.
 *   - Without --confirm, the script will exit with an error to prevent accidental deletion.
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

function usage() {
  console.error(`
Usage:
  node scripts/remove-member.js --id <member-id> --confirm

Required:
  --id       The team member's ID (get from list-members.js)
  --confirm  Required safety flag — confirms intentional deletion

Environment:
  NOTIFYER_API_BASE_URL   required
  NOTIFYER_API_TOKEN      required
`);
  process.exit(1);
}

async function main() {
  const flags = parseArgs();
  const id = getFlag(flags, "id");
  const confirm = getBooleanFlag(flags, "confirm");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!id) {
    console.error("Error: --id is required.");
    usage();
  }

  if (!confirm) {
    printJson(
      err(
        "Deletion requires --confirm flag. This is irreversible — the member's account will be permanently deleted.",
        { hint: "Re-run with --confirm to proceed." },
        true
      )
    );
  }

  const config = loadConfig({ requireToken: true });

  // Verify the member exists and is not Super Admin before deleting
  const listResult = await requestJson(config, {
    method: "GET",
    path: "/api:-4GSCDHb/auth/get_team_member",
    query: { page: 0, per_page: 200, offset: 0 },
  });

  if (!listResult.ok) {
    printJson(err(`Failed to verify member: ${listResult.error}`, null, false, listResult.status));
  }

  const members = listResult.data?.items ?? [];
  const target = members.find((m) => m.id === id);

  if (!target) {
    printJson(err(`No team member found with id "${id}". Run list-members.js to see valid IDs. (Searched first 200 members.)`, null, true));
  }

  if (target.role === "Super Admin") {
    printJson(err("Super Admin (account owner) cannot be removed.", null, true));
  }

  if (pretty) {
    process.stderr.write(`\nRemoving team member:\n`);
    process.stderr.write(`  ID:    ${target.id}\n`);
    process.stderr.write(`  Name:  ${target.name}\n`);
    process.stderr.write(`  Email: ${target.email}\n`);
    process.stderr.write(`  Role:  ${target.role}\n\n`);
  }

  const result = await requestJson(config, {
    method: "DELETE",
    path: `/api:-4GSCDHb/auth/delete_team_member/${encodeURIComponent(id)}`,
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  if (pretty) {
    process.stderr.write(`✓ Member "${target.name}" (${target.email}) removed.\n\n`);
  }

  printJson(ok({ removed_id: id, name: target.name, email: target.email }));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
