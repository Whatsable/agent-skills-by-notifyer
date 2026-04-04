#!/usr/bin/env node
/**
 * update-member.js — Update a team member's name, role, labels, or password.
 *
 * PATCH /api:-4GSCDHb/auth/user
 *
 * This is the single endpoint for ALL member modifications:
 *   - Change role (e.g. Team Member → Admin)
 *   - Assign/replace label access
 *   - Rename the member
 *   - Reset password
 *
 * Usage:
 *   # Change role only
 *   node scripts/update-member.js --id <member-id> --role Admin
 *
 *   # Assign labels (replaces existing label list)
 *   node scripts/update-member.js --id <member-id> --labels "Sales,Support"
 *
 *   # Clear all labels
 *   node scripts/update-member.js --id <member-id> --labels ""
 *
 *   # Change role + labels in one call
 *   node scripts/update-member.js --id <member-id> --role "Team Member" --labels "Sales"
 *
 *   # Rename + reset password
 *   node scripts/update-member.js --id <member-id> --name "John Doe" --password "NewPass@99"
 *
 *   # Full update
 *   node scripts/update-member.js \
 *     --id <member-id> \
 *     --name "Jane Smith" \
 *     --role "Team Member" \
 *     --labels "Sales,Support" \
 *     --password "NewPass@99"
 *
 * Output (success):
 *   { "ok": true, "data": { "id": "...", "name": "...", "role": "...", "labels": [...], ... } }
 *
 * Notes:
 *   - --id is always required (get it from list-members.js)
 *   - Omitting --password keeps the current password
 *   - --labels replaces the entire label list; pass "" to clear all labels
 *   - --labels is ignored for Admin and Team Member (All Labels) roles
 *   - Super Admin members cannot be updated
 *   - Email cannot be changed after creation
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
  node scripts/update-member.js --id <member-id> [--name <name>] [--role <role>] [--labels <label1,label2>] [--password <password>]

Required:
  --id        The team member's ID (from list-members.js)

Optional:
  --name      New display name
  --role      New role: Admin | "Team Member" | "Team Member (All Labels)"
  --labels    Comma-separated label names (replaces current list). Use "" to clear.
              Only applies to "Team Member" role.
  --password  New password (omit to keep current)
  --pretty    Print summary to stderr

Environment:
  NOTIFYER_API_BASE_URL   required
  NOTIFYER_API_TOKEN      required
`);
  process.exit(1);
}

async function main() {
  const flags = parseArgs();
  const id = getFlag(flags, "id");
  const name = getFlag(flags, "name");
  const role = getFlag(flags, "role");
  const labelsRaw = getFlag(flags, "labels");
  const password = getFlag(flags, "password");
  const pretty = getBooleanFlag(flags, "pretty");

  if (!id) {
    console.error("Error: --id is required.");
    usage();
  }

  if (role && !VALID_ROLES.includes(role)) {
    console.error(`Error: --role must be one of: ${VALID_ROLES.map((r) => `"${r}"`).join(", ")}`);
    usage();
  }

  if (!name && !role && labelsRaw === undefined && !password) {
    console.error("Error: at least one of --name, --role, --labels, or --password must be provided.");
    usage();
  }

  // First fetch current member data to fill in required fields
  const config = loadConfig({ requireToken: true });

  if (pretty) process.stderr.write(`\nFetching current member data for id=${id}...\n`);

  const listResult = await requestJson(config, {
    method: "GET",
    path: "/api:-4GSCDHb/auth/get_team_member",
    query: { page: 0, per_page: 200, offset: 0 },
  });

  if (!listResult.ok) {
    printJson(err(`Failed to fetch member list: ${listResult.error}`, listResult.data, false, listResult.status));
  }

  const members = listResult.data?.items ?? [];
  const current = members.find((m) => m.id === id);

  if (!current) {
    printJson(err(`No team member found with id "${id}". Run list-members.js to see valid IDs. (Searched first 200 members.)`, null, true));
  }

  if (current.role === "Super Admin") {
    printJson(err("Super Admin members cannot be modified.", null, true));
  }

  // Merge: use supplied values or fall back to current
  const effectiveRole = role ?? current.role;

  // Labels: only meaningful for "Team Member" role
  let effectiveLabels;
  if (labelsRaw !== undefined) {
    effectiveLabels = labelsRaw
      ? labelsRaw.split(",").map((l) => l.trim()).filter(Boolean)
      : [];
  } else {
    effectiveLabels = current.labels ?? [];
  }
  // Admin / Team Member (All Labels) always send empty array — backend ignores it
  if (effectiveRole !== "Team Member") {
    effectiveLabels = [];
  }

  const body = {
    team_id: id,
    name: name ?? current.name,
    email: current.email, // email is immutable; re-send existing
    role: effectiveRole,
    labels: effectiveLabels,
  };

  // Only include password if explicitly supplied
  if (password) {
    body.password = password;
  }

  if (pretty) {
    process.stderr.write(`Updating member: ${current.name} (${current.email})\n`);
    process.stderr.write(`  Role:   ${current.role} → ${effectiveRole}\n`);
    process.stderr.write(
      `  Labels: [${(current.labels ?? []).join(", ")}] → [${effectiveLabels.join(", ")}]\n`
    );
    if (name) process.stderr.write(`  Name:   ${current.name} → ${name}\n`);
    if (password) process.stderr.write(`  Password: (changed)\n`);
    process.stderr.write("\n");
  }

  const result = await requestJson(config, {
    method: "PATCH",
    path: "/api:-4GSCDHb/auth/user",
    body,
  });

  if (!result.ok) {
    printJson(err(result.error, result.data, false, result.status));
  }

  if (pretty) {
    process.stderr.write(`✓ Member updated successfully.\n\n`);
  }

  printJson(ok(result.data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
