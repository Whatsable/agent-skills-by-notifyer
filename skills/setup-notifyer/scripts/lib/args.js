/**
 * Minimal CLI argument parser.
 *
 * Parses `process.argv` into a flags map.
 *
 * Supported forms:
 *   --flag value        → { flag: "value" }
 *   --flag              → { flag: true }
 *   --no-flag           → { flag: false }
 *   --flag=value        → { flag: "value" }
 */

/**
 * @param {string[]} [argv]
 * @returns {Record<string, string|boolean>}
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        flags[key] = arg.slice(eqIdx + 1);
      } else if (arg.startsWith("--no-")) {
        flags[arg.slice(5)] = false;
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    }
    i++;
  }
  return flags;
}

/**
 * Get a string flag value or return undefined.
 * @param {Record<string, string|boolean>} flags
 * @param {string} name
 * @returns {string|undefined}
 */
export function getFlag(flags, name) {
  const v = flags[name];
  if (v === undefined || v === true || v === false) return undefined;
  return String(v);
}

/**
 * Get a boolean flag value. Defaults to false if absent.
 * @param {Record<string, string|boolean>} flags
 * @param {string} name
 * @returns {boolean}
 */
export function getBooleanFlag(flags, name) {
  const v = flags[name];
  if (v === undefined) return false;
  if (typeof v === "boolean") return v;
  return v !== "false" && v !== "0";
}

/**
 * Get a numeric flag value or return undefined.
 * @param {Record<string, string|boolean>} flags
 * @param {string} name
 * @returns {number|undefined}
 */
export function getNumberFlag(flags, name) {
  const v = getFlag(flags, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}
