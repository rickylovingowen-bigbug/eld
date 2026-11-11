import { FREE_OPENER } from "@/lib/conversation/guard";
import type { ConversationRepo } from "@/lib/repo/types";
import type { EntryMode, Message, Session } from "@/lib/types";

export async function openConversation(
  repo: ConversationRepo,
  input: { userId: string; entryMode: Exclude<EntryMode, "tell_more">; topicId?: string | null; sessionId?: string },
): Promise<{ session: Session; messages: Message[] }> {
  if (input.entryMode === "continue") {
    const session = input.sessionId
      ? await repo.getSession(input.sessionId)
      : await repo.findLatestOpenSession(input.userId);
    if (!session || session.status !== "open") throw new Error("No conversation to continue");
    return { session, messages: await repo.listMessages(session.id) };
  }
  if (input.entryMode === "topic") {
    if (!input.topicId) throw new Error("topicId is required");
    const existing = await repo.findOpenSessionForTopic(input.userId, input.topicId);
    if (existing) return { session: existing, messages: await repo.listMessages(existing.id) };
    const topic = await repo.getTopic(input.topicId);
    if (!topic) throw new Error("Unknown topic");
    return repo.createSession({
      userId: input.userId,
      topicId: topic.id,
      entryMode: "topic",
      opening: { content: topic.openingQuestion, kind: "opening" },
    });
  }
  const existingFree = await repo.findOpenFreeSession(input.userId);
  if (existingFree) return { session: existingFree, messages: await repo.listMessages(existingFree.id) };
  return repo.createSession({
    userId: input.userId,
    topicId: null,
    entryMode: "free",
    opening: { content: FREE_OPENER, kind: "free_opener" },
  });
}
