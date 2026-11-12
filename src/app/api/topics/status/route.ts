import { ensureSeeded } from "@/lib/catalog-sync";
import { RICKY_ID } from "@/lib/constants";
import { redirectTo, readBody } from "@/lib/http";
import { PostgresRepo } from "@/lib/repo/postgres";
import type { TopicStatus } from "@/lib/types";

const STATUSES = new Set<TopicStatus>(["recommendable", "told", "not_now", "do_not_write"]);

export async function POST(request: Request) {
  await ensureSeeded();
  const body = await readBody(request);
  if (!body.topicId || !STATUSES.has(body.status as TopicStatus)) {
    return Response.json({ error: "topicId and status are required" }, { status: 400 });
  }
  const repo = new PostgresRepo();
  await repo.setTopicStatus(RICKY_ID, body.topicId, body.status as TopicStatus);
  if (body.status === "do_not_write") {
    const open = await repo.findOpenSessionForTopic(RICKY_ID, body.topicId);
    if (open) await repo.endSession(open.id, "abandoned");
  }
  return redirectTo(request, body.next || "/");
}
