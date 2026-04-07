#!/usr/bin/env node
/**
 * create-template.js — Submit a WhatsApp message template for Meta review.
 *
 * POST /api:AFRA_QCy/create
 * Media pre-upload: GET /api:ox_LN9zX/get_file_base46_encode?attachment=<url>
 *
 * Usage (text template):
 *   node scripts/create-template.js \
 *     --name order_confirmation \
 *     --category MARKETING \
 *     --body "Hello {{1}}, your order #{{2}} has been confirmed."
 *
 * Usage (with variable example values):
 *   node scripts/create-template.js \
 *     --name order_confirmation \
 *     --category MARKETING \
 *     --body "Hello {{1}}, your order #{{2}} has been confirmed." \
 *     --variables '{"1":"John","2":"12345"}'
 *
 * Usage (with image attachment):
 *   node scripts/create-template.js \
 *     --name promo_banner \
 *     --category MARKETING \
 *     --body "Check out our latest offer!" \
 *     --type image \
 *     --media-url "https://example.com/banner.jpg"
 *
 * Usage (with pre-uploaded media handle):
 *   node scripts/create-template.js \
 *     --name promo_doc \
 *     --category UTILITY \
 *     --body "Here is your invoice." \
 *     --type document \
 *     --media-handle "<handle from upload>"
 *
 * Usage (with buttons):
 *   node scripts/create-template.js \
 *     --name order_confirmation \
 *     --category MARKETING \
 *     --body "Your order {{1}} is ready!" \
 *     --variables '{"1":"12345"}' \
 *     --buttons '[{"type":"Quick Reply","text":"Track Order"},{"type":"Quick Reply","text":"Cancel"}]'
 *
 * Usage (AUTHENTICATION template):
 *   node scripts/create-template.js \
 *     --name verify_login \
 *     --category AUTHENTICATION \
 *     --language en \
 *     --expiry 10 \
 *     --otp-button-text "Copy Code"
 *
 * Flags:
 *   --name <name>           Template name: lowercase, underscores, no leading digit  (required)
 *   --category <value>      MARKETING | UTILITY | AUTHENTICATION                    (required)
 *   --body <text>           Message body text; use {{1}}, {{2}} for variables        (required unless AUTHENTICATION)
 *   --language <code>       Language code, e.g. en, es, fr (default: en)            (optional)
 *   --type <value>          text | image | document | video (default: text)          (optional)
 *   --media-url <url>       Public URL of media to pre-upload (for non-text types)   (optional)
 *   --media-handle <handle> Pre-uploaded media handle (alternative to --media-url)   (optional)
 *   --variables <json>      JSON object mapping variable index to example value      (optional)
 *                           e.g. '{"1":"John","2":"12345"}'
 *   --buttons <json>        JSON array of button objects (see Button shapes below)   (optional)
 *   --expiry <minutes>      AUTHENTICATION only: code expiry in minutes (default 10) (optional)
 *   --otp-button-text <txt> AUTHENTICATION only: button label (default "Copy Code")  (optional)
 *   --no-security-rec       AUTHENTICATION only: omit security recommendation footer (optional)
 *
 * Button shapes (pass as --buttons JSON array):
 *   Quick Reply:       { "type": "Quick Reply", "text": "Yes" }
 *   Visit Website:     { "type": "Visit Website", "buttonText": "View", "urlType": "static",
 *                        "buttonUrl": "https://example.com" }
 *   Visit Website (dynamic URL):
 *                      { "type": "Visit Website", "buttonText": "Track", "urlType": "dynamic",
 *                        "buttonUrl": "https://example.com/track/", "dynamicValue": "order_id" }
 *   Call Phone Number: { "type": "Call Phone Number", "buttonText": "Call Us",
 *                        "phoneNumber": "+14155550123" }
 *   Copy Offer Code:   { "type": "Copy Offer Code", "code": "SAVE20" }
 *
 * Button limits:
 *   Quick Reply: up to 10 | Visit Website: up to 2 | Call Phone Number: 1 | Copy Offer Code: 1
 *   Total: up to 10 buttons
 *
 * Output (success):
 *   {
 *     "ok": true,
 *     "data": { ...Meta API response from WhatsApp Business API }
 *   }
 *
 *   The response is the raw Meta API response returned by WhatsApp's template
 *   creation endpoint (var:request_hit_into_whatsapp in Xano). It typically contains
 *   the template ID, status ("PENDING"), and category assigned by Meta. The template
 *   is stored in Notifyer's database only if Meta accepted it.
 *
 * Output (duplicate name):
 *   { "ok": false, "error": "A template named 'order_confirm' already exists.", "blocked": true }
 *
 * Output (error):
 *   { "ok": false, "error": "...", "data": {...} }
 *
 * Notes:
 *   - Template names must be unique per workspace. Xano checks for an existing template
 *     with the same name (step 2 of the function stack) and fires a Precondition error
 *     (HTTP 400) if a duplicate is found. The script surfaces this as a friendly error.
 *   - Template names: lowercase letters, digits, underscores only; cannot start with a digit.
 *   - Meta reviews all templates. Approval typically takes under 60 seconds.
 *   - A newly submitted template starts with status "PENDING". Poll with get-template.js
 *     to check when status changes to "approved" or "rejected".
 *   - The template is only stored in Notifyer's database if Meta accepts it. If the Meta
 *     API call fails, the template will NOT appear in list-templates.js output.
 *   - For AUTHENTICATION templates: the body is auto-generated by Xano; --body is not needed.
 *   - Body variables ({{1}}, {{2}}) must all have example values in --variables.
 *     Meta requires sample values during the review process.
 *   - For non-text types, one of --media-url or --media-handle is required.
 *     --media-url triggers an automatic pre-upload call to get a handle.
 *   - Supported media formats: PNG, JPG (image), MP4 (video), PDF (document).
 *   - Uses console auth mode (Authorization: Bearer <token>).
 *
 * Environment:
 *   NOTIFYER_API_BASE_URL   required
 *   NOTIFYER_API_TOKEN      required (from login.js)
 */

import { loadConfig, requestJson } from "./lib/notifyer-api.js";
import { parseArgs, getFlag, getBooleanFlag } from "./lib/args.js";
import { ok, err, printJson } from "./lib/result.js";

const VALID_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"];
const VALID_TYPES = ["text", "image", "document", "video"];

const BUTTON_LIMITS = {
  "Quick Reply": 10,
  "Visit Website": 2,
  "Call Phone Number": 1,
  "Copy Offer Code": 1,
};
const TOTAL_BUTTON_LIMIT = 10;

function usage() {
  console.error(`
Usage:
  node scripts/create-template.js --name <name> --category <cat> --body "<text>" [options]

Required:
  --name <name>           Lowercase, underscores, no leading digit (e.g. order_confirm)
  --category <value>      MARKETING | UTILITY | AUTHENTICATION
  --body <text>           Message body (use {{1}}, {{2}} for variables;
                          not needed for AUTHENTICATION)

Options:
  --language <code>       Language code (default: en)
  --type <value>          text | image | document | video (default: text)
  --media-url <url>       Public URL of media to pre-upload (required for non-text)
  --media-handle <handle> Pre-uploaded media handle (alternative to --media-url)
  --variables <json>      JSON mapping of variable index -> example value
                          e.g. '{"1":"John","2":"12345"}'
  --buttons <json>        JSON array of button objects (see SKILL.md for shapes)
  --expiry <minutes>      AUTHENTICATION only: code expiry minutes (default: 10)
  --otp-button-text <txt> AUTHENTICATION only: button label (default: "Copy Code")
  --no-security-rec       AUTHENTICATION only: omit security recommendation

Examples:
  node scripts/create-template.js --name promo --category MARKETING --body "Sale {{1}}!" --variables '{"1":"50%"}'
  node scripts/create-template.js --name invoice --category UTILITY --body "Invoice attached." --type document --media-url "https://example.com/invoice.pdf"
  node scripts/create-template.js --name verify_otp --category AUTHENTICATION
`);
  process.exit(1);
}

/**
 * Validate and normalise a template name.
 * Rules (from frontend): lowercase, no leading digit, only a-z 0-9 _ and unicode letters.
 */
function validateName(name) {
  if (!name || !name.trim()) return { valid: false, reason: "name is empty" };
  if (/^\d/.test(name)) return { valid: false, reason: "name cannot start with a digit" };
  if (/[A-Z]/.test(name)) return { valid: false, reason: "name must be lowercase (use underscores instead of spaces)" };
  if (/\s/.test(name)) return { valid: false, reason: "name cannot contain spaces (use underscores)" };
  if (name.length > 512) return { valid: false, reason: "name exceeds 512 characters" };
  return { valid: true };
}

/**
 * Extract variable indices from body text: {{1}}, {{2}}, etc.
 * Returns a sorted, unique array of ints.
 */
function extractBodyVariables(body) {
  const matched = body.match(/{{\d+}}/g) ?? [];
  const unique = [...new Set(matched.map((v) => parseInt(v.replace(/{{|}}/g, ""), 10)))];
  return unique.sort((a, b) => a - b);
}

/**
 * Validate buttons array and assign sequential IDs.
 */
function prepareButtons(buttons) {
  if (!Array.isArray(buttons)) {
    return { ok: false, error: "--buttons must be a JSON array" };
  }

  if (buttons.length > TOTAL_BUTTON_LIMIT) {
    return { ok: false, error: `Total button limit is ${TOTAL_BUTTON_LIMIT}` };
  }

  const typeCounts = {};
  const prepared = [];

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const id = i + 1;

    if (!btn.type) {
      return { ok: false, error: `Button at index ${i} is missing "type"` };
    }

    const limit = BUTTON_LIMITS[btn.type];
    if (limit === undefined) {
      return {
        ok: false,
        error: `Unknown button type "${btn.type}". Valid types: ${Object.keys(BUTTON_LIMITS).join(", ")}`,
      };
    }

    typeCounts[btn.type] = (typeCounts[btn.type] ?? 0) + 1;
    if (typeCounts[btn.type] > limit) {
      return {
        ok: false,
        error: `Too many "${btn.type}" buttons (limit: ${limit})`,
      };
    }

    switch (btn.type) {
      case "Quick Reply":
        if (!btn.text?.trim()) {
          return { ok: false, error: `Quick Reply button at index ${i} is missing "text"` };
        }
        prepared.push({ id, type: btn.type, text: btn.text });
        break;

      case "Visit Website":
        if (!btn.buttonText?.trim()) {
          return { ok: false, error: `Visit Website button at index ${i} is missing "buttonText"` };
        }
        if (!btn.urlType || !["static", "dynamic"].includes(btn.urlType)) {
          return { ok: false, error: `Visit Website button at index ${i}: "urlType" must be "static" or "dynamic"` };
        }
        if (btn.urlType === "dynamic" && !btn.dynamicValue?.trim()) {
          return { ok: false, error: `Visit Website button at index ${i}: "dynamicValue" is required for dynamic URL` };
        }
        if (btn.urlType === "static" && !btn.buttonUrl?.trim()) {
          return { ok: false, error: `Visit Website button at index ${i}: "buttonUrl" is required for static URL` };
        }
        prepared.push({
          id,
          type: btn.type,
          buttonText: btn.buttonText,
          urlType: btn.urlType,
          buttonUrl: btn.buttonUrl ?? "",
          dynamicValue: btn.dynamicValue ?? "",
        });
        break;

      case "Call Phone Number":
        if (!btn.buttonText?.trim()) {
          return { ok: false, error: `Call Phone Number button at index ${i} is missing "buttonText"` };
        }
        if (!btn.phoneNumber?.trim()) {
          return { ok: false, error: `Call Phone Number button at index ${i} is missing "phoneNumber"` };
        }
        prepared.push({
          id,
          type: btn.type,
          buttonText: btn.buttonText,
          phoneNumber: btn.phoneNumber,
        });
        break;

      case "Copy Offer Code":
        if (!btn.code?.trim()) {
          return { ok: false, error: `Copy Offer Code button at index ${i} is missing "code"` };
        }
        prepared.push({ id, type: btn.type, code: btn.code });
        break;

      default:
        return { ok: false, error: `Unknown button type "${btn.type}"` };
    }
  }

  return { ok: true, data: prepared };
}

/**
 * Pre-upload media from a public URL and return the handle string.
 * GET /api:ox_LN9zX/get_file_base46_encode?attachment=<url>
 */
async function uploadMedia(config, mediaUrl) {
  process.stderr.write(`  Uploading media: ${mediaUrl}\n`);
  const result = await requestJson(config, {
    method: "GET",
    path: "/api:ox_LN9zX/get_file_base46_encode",
    query: { attachment: mediaUrl },
  });

  if (!result.ok) {
    return { ok: false, error: `Media upload failed: ${result.error}` };
  }

  if (!result.data?.success || !result.data?.handle) {
    return {
      ok: false,
      error: `Media upload failed: ${result.data?.error ?? "no handle returned"}`,
    };
  }

  process.stderr.write(`  Media handle: ${result.data.handle}\n`);
  return { ok: true, handle: result.data.handle };
}

async function main() {
  const flags = parseArgs();
  const name = getFlag(flags, "name");
  const category = getFlag(flags, "category")?.toUpperCase();
  const body = getFlag(flags, "body") ?? "";
  const language = getFlag(flags, "language") ?? "en";
  const templateType = getFlag(flags, "type") ?? "text";
  const mediaUrl = getFlag(flags, "media-url");
  const mediaHandle = getFlag(flags, "media-handle");
  const variablesRaw = getFlag(flags, "variables");
  const buttonsRaw = getFlag(flags, "buttons");
  const expiry = getFlag(flags, "expiry") ?? "10";
  const otpButtonText = getFlag(flags, "otp-button-text") ?? "Copy Code";
  const noSecurityRec = getBooleanFlag(flags, "no-security-rec");

  // ── Validate required fields ────────────────────────────────────────────────
  if (!name) {
    console.error("Error: --name is required.\n");
    usage();
  }

  const nameCheck = validateName(name);
  if (!nameCheck.valid) {
    printJson(err(`Invalid template name: ${nameCheck.reason}`));
  }

  if (!category) {
    console.error("Error: --category is required.\n");
    usage();
  }

  if (!VALID_CATEGORIES.includes(category)) {
    printJson(
      err(
        `Invalid --category "${category}". Must be one of: ${VALID_CATEGORIES.join(", ")}`
      )
    );
  }

  if (!VALID_TYPES.includes(templateType)) {
    printJson(
      err(
        `Invalid --type "${templateType}". Must be one of: ${VALID_TYPES.join(", ")}`
      )
    );
  }

  // Body is required for non-AUTHENTICATION templates
  if (category !== "AUTHENTICATION" && !body.trim()) {
    console.error("Error: --body is required for MARKETING and UTILITY templates.\n");
    usage();
  }

  // ── Parse variables ─────────────────────────────────────────────────────────
  let variableValues = {};
  if (variablesRaw) {
    try {
      variableValues = JSON.parse(variablesRaw);
    } catch {
      printJson(err('--variables must be valid JSON, e.g. \'{"1":"John","2":"12345"}\''));
    }
  }

  // Auto-detect body variables and verify all have example values
  const bodyVariables = category !== "AUTHENTICATION" ? extractBodyVariables(body) : [];
  const missingExamples = bodyVariables.filter(
    (v) => !variableValues[String(v)] && !variableValues[v]
  );
  if (missingExamples.length > 0) {
    printJson(
      err(
        `Missing example values for body variables: ${missingExamples.map((v) => `{{${v}}}`).join(", ")}. ` +
          `Provide them with --variables '{"${missingExamples[0]}":"example value",...}'`
      )
    );
  }

  // Normalise variableValues to use numeric keys (Xano convention)
  const normalisedVariableValues = {};
  for (const [k, v] of Object.entries(variableValues)) {
    normalisedVariableValues[parseInt(k, 10)] = v;
  }

  // ── Parse buttons ────────────────────────────────────────────────────────────
  let preparedButtons = [];
  if (buttonsRaw) {
    let rawButtons;
    try {
      rawButtons = JSON.parse(buttonsRaw);
    } catch {
      printJson(err("--buttons must be a valid JSON array"));
    }
    const btnResult = prepareButtons(rawButtons);
    if (!btnResult.ok) {
      printJson(err(btnResult.error));
    }
    preparedButtons = btnResult.data;
  }

  // ── Handle media upload ──────────────────────────────────────────────────────
  const config = loadConfig({ requireToken: true });
  let finalMediaHandle = "";

  if (templateType !== "text") {
    if (mediaHandle) {
      finalMediaHandle = mediaHandle;
    } else if (mediaUrl) {
      const uploadResult = await uploadMedia(config, mediaUrl);
      if (!uploadResult.ok) {
        printJson(err(uploadResult.error));
      }
      finalMediaHandle = uploadResult.handle;
    } else {
      printJson(
        err(
          `--media-url or --media-handle is required for --type "${templateType}". ` +
            "Provide a public media URL (PNG/JPG/MP4/PDF) via --media-url."
        )
      );
    }
  }

  // ── Build payload ────────────────────────────────────────────────────────────
  const payload = {
    name,
    category,
    language,
    templateType,
    mediaUrl: finalMediaHandle,
    temBody: body,
    mediaUrlVariableValues: "",
    bodyVariables,
    variableValues: normalisedVariableValues,
    buttons: preparedButtons,
    ...(category === "AUTHENTICATION" && {
      addSecurityRecommendation: !noSecurityRec,
      codeExpirationMinutes: parseInt(expiry, 10),
      otpButtonText,
    }),
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const result = await requestJson(config, {
    method: "POST",
    path: "/api:AFRA_QCy/create",
    body: payload,
  });

  if (!result.ok) {
    // Step 6 of the Xano function stack is a Precondition that fires if a template
    // with the same name already exists (var:templates != false). Xano returns HTTP 400
    // with a "Precondition Failed" message in that case.
    const isDuplicate =
      result.status === 400 &&
      typeof result.error === "string" &&
      result.error.toLowerCase().includes("precondition");

    if (isDuplicate) {
      printJson(
        err(
          `A template named '${name}' already exists.`,
          result.data,
          true,
          result.status
        )
      );
    }

    printJson(err(result.error, result.data, false, result.status));
  }

  // The response is the raw Meta API response (var:request_hit_into_whatsapp).
  // It contains what WhatsApp's Business API returned for the template creation request.
  // The template is stored in Notifyer only if Meta accepted it.
  printJson(ok(result.data));
}

main().catch((e) => {
  printJson(err(`Unexpected error: ${e.message}`));
});
