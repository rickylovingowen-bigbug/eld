import { createModelClient } from "@/lib/ai/client";
import { RICKY_ID } from "@/lib/constants";
import { runTurn } from "@/lib/conversation/engine";
import { PostgresRepo } from "@/lib/repo/postgres";
import { IdempotencyConflict } from "@/lib/repo/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const body = (await request.json()) as { messageId?: string; content?: string };
  if (!body.messageId || !body.content?.trim()) {
    return Response.json({ error: "messageId and content are required" }, { status: 400 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const repo = new PostgresRepo();
        const session = await repo.getSession(sessionId);
        if (!session || session.userId !== RICKY_ID) {
          send({ type: "error", message: "Session not found" });
          return;
        }
        const result = await runTurn(
          repo,
          createModelClient(),
          { sessionId, userId: RICKY_ID, messageId: body.messageId as string, content: body.content as string },
          { onUserSaved: (message) => send({ type: "user_saved", message }) },
        );
        const parts = result.replayed ? [result.assistantMessage.content] : chunk(result.assistantMessage.content);
        for (const part of parts) send({ type: "token", text: part });
        send({ type: "done", message: result.assistantMessage, session: result.session, decision: result.decisionKind });
      } catch (error) {
        const message = error instanceof IdempotencyConflict ? error.message : "Something went wrong.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
    },
  });
}

function chunk(text: string): string[] {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [text];
}
