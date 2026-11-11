import { ensureSeeded } from "@/lib/catalog-sync";
import { RICKY_ID } from "@/lib/constants";
import { openConversation } from "@/lib/conversation/open";
import { redirectTo, readBody } from "@/lib/http";
import { PostgresRepo } from "@/lib/repo/postgres";

export async function POST(request: Request) {
  await ensureSeeded();
  const body = await readBody(request);
  const entryMode = body.entryMode === "free" || body.entryMode === "continue" ? body.entryMode : "topic";
  if (body.entryMode === "tell_more") {
    return Response.json({ error: "tell_more arrives in v0.2" }, { status: 400 });
  }
  const repo = new PostgresRepo();
  const opened = await openConversation(repo, {
    userId: RICKY_ID,
    entryMode,
    topicId: body.topicId || null,
    sessionId: body.sessionId,
  });
  return redirectTo(request, `/story/${opened.session.id}`);
}
