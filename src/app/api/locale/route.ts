import { ensureSeeded } from "@/lib/catalog-sync";
import { RICKY_ID } from "@/lib/constants";
import { getSql } from "@/lib/db";
import { redirectTo, readBody } from "@/lib/http";

export async function POST(request: Request) {
  await ensureSeeded();
  const body = await readBody(request);
  const locale = body.locale === "zh" ? "zh" : "en";
  const sql = getSql();
  await sql`update users set ui_locale = ${locale} where id = ${RICKY_ID}`;
  const response = redirectTo(request, "/");
  response.cookies.set("eld_locale", locale, { path: "/", sameSite: "lax" });
  return response;
}
