/**
 * Standard output helpers.
 *
 * All scripts print a single JSON line to stdout so that calling agents
 * can reliably parse the result without screen-scraping.
 *
 * Success: { "ok": true, "data": { ... } }
 * Failure: { "ok": false, "error": "...", "details": ..., "blocked": false }
 */

/**
 * Build a success result.
 * @param {any} data
 * @returns {{ ok: true, data: any }}
 */
export function ok(data) {
  return { ok: true, data };
}

/**
 * Build an error result.
 * @param {string} message
 * @param {any} [details]
 * @param {boolean} [blocked=false]  true if action is blocked and agent should not retry
 * @param {number} [status]          HTTP status code if applicable
 * @returns {{ ok: false, error: string, details?: any, blocked: boolean, status?: number }}
 */
export function err(message, details, blocked = false, status) {
  const result = { ok: false, error: message, blocked };
  if (details !== undefined) result.details = details;
  if (status !== undefined) result.status = status;
  return result;
}

/**
 * Print a result object as a single JSON line to stdout and exit.
 * @param {{ ok: boolean }} value
 */
export function printJson(value) {
  process.stdout.write(JSON.stringify(value) + "\n");
  process.exit(value.ok ? 0 : 1);
}
