import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessPassword, verifyAccessToken } from "@/lib/access";

function stamp(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function isOpen(pathname: string): boolean {
  return (
    pathname === "/unlock" ||
    pathname === "/api/unlock" ||
    pathname === "/robots.txt" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/_next/")
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const password = accessPassword();
  if (!password || isOpen(request.nextUrl.pathname)) {
    return stamp(NextResponse.next());
  }
  const token = request.cookies.get(ACCESS_COOKIE)?.value ?? "";
  if (token && (await verifyAccessToken(token, password))) {
    return stamp(NextResponse.next());
  }
  const redirect = request.nextUrl.clone();
  redirect.pathname = "/unlock";
  redirect.search = "";
  if (request.nextUrl.pathname !== "/") {
    redirect.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  }
  return stamp(NextResponse.redirect(redirect));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
