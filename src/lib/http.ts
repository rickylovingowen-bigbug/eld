import { NextResponse } from "next/server";

function firstHeader(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function hostname(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(0, end + 1);
  }
  return host.split(":")[0] ?? host;
}

function isLocalHost(host: string): boolean {
  const name = hostname(host).toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "::1" || name === "[::1]";
}

/**
 * Absolute URL for a same-origin redirect, using the public host when a proxy
 * says what it is. If the only host we can see is localhost but a proxy already
 * rewrote the scheme, return a relative path so the browser stays on the tunnel.
 */
export function resolveRedirectLocation(request: Request, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const forwardedHost = firstHeader(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = firstHeader(request.headers.get("x-forwarded-proto"))?.toLowerCase() ?? null;
  if (!host) return normalized;

  const local = isLocalHost(host);
  if (local && forwardedProto && !forwardedHost) return normalized;

  const proto = forwardedProto || new URL(request.url).protocol.replace(":", "") || "http";
  return `${proto}://${host}${normalized}`;
}

export function redirectTo(request: Request, path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: resolveRedirectLocation(request, path) },
  });
}

export async function readBody(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(json).map(([key, value]) => [key, String(value ?? "")]));
  }
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
}
