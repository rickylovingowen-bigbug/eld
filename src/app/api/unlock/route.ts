import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE_SECONDS,
  accessCookieSecure,
  accessPassword,
  clearAccessAttempts,
  clientIp,
  noteFailedAccess,
  passwordsMatch,
  safeNextPath,
  signAccessToken,
  tooManyAccessAttempts,
} from "@/lib/access";
import { readBody, redirectTo } from "@/lib/http";

export async function POST(request: Request): Promise<NextResponse> {
  const password = accessPassword();
  const body = await readBody(request);
  const next = safeNextPath(body.next);
  if (!password) return redirectTo(request, "/");

  const ip = clientIp(request);
  if (tooManyAccessAttempts(ip)) {
    return redirectTo(request, `/unlock?error=limited&next=${encodeURIComponent(next)}`);
  }
  const given = body.password ?? "";
  if (!(await passwordsMatch(given, password))) {
    noteFailedAccess(ip);
    const error = tooManyAccessAttempts(ip) ? "limited" : "mismatch";
    return redirectTo(request, `/unlock?error=${error}&next=${encodeURIComponent(next)}`);
  }
  clearAccessAttempts(ip);
  const response = redirectTo(request, next);
  response.cookies.set(ACCESS_COOKIE, await signAccessToken(password), {
    httpOnly: true,
    secure: accessCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE_SECONDS,
  });
  return response;
}
