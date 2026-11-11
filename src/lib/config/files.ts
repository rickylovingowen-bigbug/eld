import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, { mtimeMs: number; value: unknown }>();

function resolveRepoFile(relativePath: string): string {
  if (relativePath.startsWith("config/")) {
    return path.join(process.cwd(), "config", relativePath.slice("config/".length));
  }
  if (relativePath.startsWith("prompts/")) {
    return path.join(process.cwd(), "prompts", relativePath.slice("prompts/".length));
  }
  if (relativePath.startsWith("docs/")) {
    return path.join(process.cwd(), "docs", relativePath.slice("docs/".length));
  }
  throw new Error(`Refusing to read ${relativePath}`);
}

export function readJsonFile<T>(relativePath: string): T {
  const file = resolveRepoFile(relativePath);
  const mtimeMs = fs.statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit.value as T;
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as T;
  cache.set(file, { mtimeMs, value });
  return value;
}

export function readTextFile(relativePath: string): { text: string; mtimeMs: number } {
  const file = resolveRepoFile(relativePath);
  const stat = fs.statSync(file);
  return { text: fs.readFileSync(file, "utf8"), mtimeMs: stat.mtimeMs };
}

export function configMtime(relativePaths: string[]): number {
  return relativePaths.reduce((max, relativePath) => {
    const file = resolveRepoFile(relativePath);
    return Math.max(max, fs.statSync(file).mtimeMs);
  }, 0);
}
