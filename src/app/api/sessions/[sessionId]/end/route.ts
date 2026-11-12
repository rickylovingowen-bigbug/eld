import { RICKY_ID } from "@/lib/constants";
import { redirectTo } from "@/lib/http";
import { PostgresRepo } from "@/lib/repo/postgres";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const repo = new PostgresRepo();
  const session = await repo.getSession(sessionId);
  if (!session || session.userId !== RICKY_ID) return redirectTo(request, "/");
  const messages = await repo.listMessages(sessionId);
  const hasUser = messages.some((message) => message.role === "user");
  await repo.endSession(sessionId, hasUser ? "ended" : "abandoned");
  return redirectTo(request, hasUser ? `/review/${sessionId}` : "/");
}
