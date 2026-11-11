export const ACCESS_COOKIE = "eld_access";
export const ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;

const failures = new Map<string, { count: number; resetAt: number }>();

export function accessPassword(): string | null {
  const value = process.env.ACCESS_PASSWORD?.trim();
  return value ? value : null;
}

export function accessCookieSecure(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  return new URL(request.url).protocol === "https:";
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value || value.length > 200) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return "/";
  if (value.startsWith("/unlock") || value.startsWith("/api/unlock")) return "/";
  return value;
}

export function resetAccessLimits(): void {
  failures.clear();
}

/** True when this IP has failed the password too many times in the window. */
export function tooManyAccessAttempts(ip: string, now = Date.now()): boolean {
  const bucket = failures.get(ip);
  if (!bucket || bucket.resetAt <= now) return false;
  return bucket.count >= MAX_FAILURES;
}

export function noteFailedAccess(ip: string, now = Date.now()): void {
  const bucket = failures.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    bucket.count += 1;
  }
  if (failures.size > 1000) {
    for (const [key, value] of failures) {
      if (value.resetAt <= now) failures.delete(key);
    }
  }
}

export function clearAccessAttempts(ip: string): void {
  failures.delete(ip);
}

function utf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const copy = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(copy).set(encoded);
  return new Uint8Array(copy);
}

export function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(value));
  return new Uint8Array(digest);
}

export async function passwordsMatch(given: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(given), sha256(expected)]);
  return timingSafeEqualBytes(left, right);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + pad);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function derivedKey(password: string): Promise<CryptoKey> {
  const secret = await crypto.subtle.digest("SHA-256", utf8(`eld-access-v1:${password}`));
  return crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function signPayload(password: string, payload: string): Promise<string> {
  const key = await derivedKey(password);
  const mac = await crypto.subtle.sign("HMAC", key, utf8(payload));
  return bytesToBase64Url(new Uint8Array(mac));
}

export async function signAccessToken(password: string, now = Date.now()): Promise<string> {
  const payload = bytesToBase64Url(utf8(JSON.stringify({ exp: now + ACCESS_MAX_AGE_SECONDS * 1000 })));
  const signature = await signPayload(password, payload);
  return `${payload}.${signature}`;
}

export async function verifyAccessToken(token: string, password: string, now = Date.now()): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot <= 0 || token.indexOf(".", dot + 1) !== -1) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await signPayload(password, payload);
  const matches = timingSafeEqualBytes(utf8(signature), utf8(expected));
  if (!matches) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { exp?: unknown };
    return typeof parsed.exp === "number" && parsed.exp > now;
  } catch {
    return false;
  }
}
