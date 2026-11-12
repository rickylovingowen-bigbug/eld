import fs from "node:fs";
import path from "node:path";

/**
 * Load `.env` then `.env.local` for scripts that Node does not load itself.
 * Values already set in the environment win, matching Next.js.
 * `.env.local` overrides `.env`.
 */
export function loadLocalEnv(cwd = process.cwd()): void {
  const values = new Map<string, string>();
  for (const name of [".env", ".env.local"]) {
    const file = path.join(cwd, name);
    if (!fs.existsSync(file)) continue;
    for (const [key, value] of parseEnv(fs.readFileSync(file, "utf8"))) {
      values.set(key, value);
    }
  }
  for (const [key, value] of values) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function parseEnv(text: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries.push([key, value]);
  }
  return entries;
}
