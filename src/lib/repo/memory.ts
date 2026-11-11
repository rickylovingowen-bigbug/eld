import { randomUUID } from "node:crypto";
import { IdempotencyConflict, type CommitTurnInput, type ConversationRepo, type MemoryBundle } from "@/lib/repo/types";
import type {
  Classification,
  EntryMode,
  Message,
  MessageKind,
  ModelCallRecord,
  Session,
  TopicContent,
  TopicStatus,
} from "@/lib/types";

interface StoredPoint {
  userId: string;
  topicId: string | null;
  point: string;
  messageId: string;
  kind: "refusal" | "do_not_write";
}

/**
 * In-memory repo used by unit tests and the eval runner.
 * Insert semantics match the Postgres unique keys: same id + same content replays,
 * same id + different content conflicts, one assistant reply per user message.
 */
export class MemoryRepo implements ConversationRepo {
  readonly sessions = new Map<string, Session>();
  readonly messages: Message[] = [];
  readonly classifications = new Map<string, Classification>();
  readonly topicStatus = new Map<string, TopicStatus>();
  readonly points: StoredPoint[] = [];
  readonly reflection = new Map<string, { asked: boolean; meaning: string | null; meaningMessageId: string | null }>();
  readonly calls: (ModelCallRecord & { id: string; sessionId?: string | null })[] = [];
  gaps: MemoryBundle["openingGap"] = null;

  constructor(private readonly topics: TopicContent[]) {}

  async createSession(input: {
    userId: string;
    topicId: string | null;
    entryMode: EntryMode;
    opening: { content: string; kind: MessageKind };
  }): Promise<{ session: Session; messages: Message[] }> {
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      userId: input.userId,
      topicId: input.topicId,
      storyId: null,
      entryMode: input.entryMode,
      followupsUsed: 0,
      extendedByUser: false,
      awaiting: null,
      status: "open",
      startedAt: now,
      endedAt: null,
      lastActivityAt: now,
    };
    const opening: Message = {
      id: randomUUID(),
      sessionId: session.id,
      userId: input.userId,
      role: "assistant",
      kind: input.opening.kind,
      content: input.opening.content,
      locale: "en",
      inReplyTo: null,
      createdAt: now,
    };
    this.sessions.set(session.id, session);
    this.messages.push(opening);
    return { session, messages: [opening] };
  }

  async getSession(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }

  async listMessages(sessionId: string): Promise<Message[]> {
    return this.messages.filter((message) => message.sessionId === sessionId);
  }

  async insertUserMessage(input: {
    id: string;
    sessionId: string;
    userId: string;
    content: string;
  }): Promise<{ message: Message; inserted: boolean }> {
    const existing = this.messages.find((message) => message.id === input.id);
    if (existing) {
      if (existing.content !== input.content || existing.sessionId !== input.sessionId) {
        throw new IdempotencyConflict();
      }
      return { message: existing, inserted: false };
    }
    const message: Message = {
      id: input.id,
      sessionId: input.sessionId,
      userId: input.userId,
      role: "user",
      kind: "user_turn",
      content: input.content,
      locale: "en",
      inReplyTo: null,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(message);
    const session = this.sessions.get(input.sessionId);
    if (session) session.lastActivityAt = message.createdAt;
    return { message, inserted: true };
  }

  async findAssistantReply(userMessageId: string): Promise<Message | null> {
    return (
      this.messages.find((message) => message.role === "assistant" && message.inReplyTo === userMessageId) ??
      null
    );
  }

  async getClassification(messageId: string): Promise<Classification | null> {
    return this.classifications.get(messageId) ?? null;
  }

  async saveClassification(messageId: string, classification: Classification): Promise<void> {
    if (!this.classifications.has(messageId)) this.classifications.set(messageId, classification);
  }

  async listClassifications(sessionId: string): Promise<{ messageId: string; classification: Classification }[]> {
    return this.messages
      .filter((message) => message.sessionId === sessionId && message.role === "user")
      .map((message) => {
        const classification = this.classifications.get(message.id);
        return classification ? { messageId: message.id, classification } : null;
      })
      .filter((item): item is { messageId: string; classification: Classification } => item != null);
  }

  async commitAssistantTurn(input: CommitTurnInput): Promise<{ message: Message; session: Session; inserted: boolean }> {
    const session = this.sessions.get(input.sessionId);
    if (!session) throw new Error("Session not found");
    const existing = await this.findAssistantReply(input.inReplyTo);
    if (existing) return { message: existing, session, inserted: false };
    const message: Message = {
      id: randomUUID(),
      sessionId: input.sessionId,
      userId: input.userId,
      role: "assistant",
      kind: input.kind,
      content: input.content,
      locale: "en",
      inReplyTo: input.inReplyTo,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(message);
    if (input.countsAsFollowUp) session.followupsUsed += 1;
    if (input.setExtended) session.extendedByUser = true;
    if (input.clearAwaiting) session.awaiting = null;
    else if (input.setAwaiting) session.awaiting = input.setAwaiting;
    if (input.endSession) {
      session.status = "ended";
      session.endedAt = message.createdAt;
    }
    session.lastActivityAt = message.createdAt;
    for (const point of input.points ?? []) this.rememberPoint(point);
    if (input.markTopicDoNotWrite) {
      this.topicStatus.set(
        statusKey(input.markTopicDoNotWrite.userId, input.markTopicDoNotWrite.topicId),
        "do_not_write",
      );
    }
    return { message, session, inserted: true };
  }

  async getTopic(topicId: string): Promise<TopicContent | null> {
    return this.topics.find((topic) => topic.id === topicId) ?? null;
  }

  async listDoNotWrite(userId: string): Promise<{ id: string; titleEn: string }[]> {
    return this.topics
      .filter((topic) => this.topicStatus.get(statusKey(userId, topic.id)) === "do_not_write")
      .map((topic) => ({ id: topic.id, titleEn: topic.title.en }));
  }

  async listRefusalPoints(userId: string, topicId: string | null): Promise<string[]> {
    return this.points
      .filter(
        (point) =>
          point.kind === "refusal" &&
          point.userId === userId &&
          (topicId == null || point.topicId == null || point.topicId === topicId),
      )
      .map((point) => point.point);
  }

  async getMemory(): Promise<MemoryBundle> {
    return { profile: [], people: [], storySummaries: [], openingGap: this.gaps };
  }

  async findLatestOpenSession(userId: string): Promise<Session | null> {
    return (
      [...this.sessions.values()]
        .filter((session) => session.userId === userId && session.status === "open")
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0] ?? null
    );
  }

  async findOpenSessionForTopic(userId: string, topicId: string): Promise<Session | null> {
    return (
      [...this.sessions.values()].find(
        (session) => session.userId === userId && session.topicId === topicId && session.status === "open",
      ) ?? null
    );
  }

  async findOpenFreeSession(userId: string): Promise<Session | null> {
    return (
      [...this.sessions.values()].find(
        (session) => session.userId === userId && session.topicId == null && session.status === "open",
      ) ?? null
    );
  }

  async endSession(id: string, status: "ended" | "abandoned"): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    session.status = status;
    session.endedAt = new Date().toISOString();
  }

  async setTopicStatus(userId: string, topicId: string, status: TopicStatus): Promise<void> {
    this.topicStatus.set(statusKey(userId, topicId), status);
  }

  async getTopicReflection(userId: string, topicId: string): Promise<{
    asked: boolean;
    meaning: string | null;
    meaningMessageId: string | null;
  }> {
    return this.reflection.get(statusKey(userId, topicId)) ?? { asked: false, meaning: null, meaningMessageId: null };
  }

  async markReflectionAsked(userId: string, topicId: string): Promise<void> {
    const key = statusKey(userId, topicId);
    const current = this.reflection.get(key) ?? { asked: false, meaning: null, meaningMessageId: null };
    this.reflection.set(key, { ...current, asked: true });
  }

  async saveTopicMeaning(userId: string, topicId: string, text: string, messageId: string): Promise<void> {
    const key = statusKey(userId, topicId);
    const current = this.reflection.get(key) ?? { asked: true, meaning: null, meaningMessageId: null };
    if (current.meaning) return;
    this.reflection.set(key, { ...current, asked: true, meaning: text, meaningMessageId: messageId });
  }

  async logModelCall(call: ModelCallRecord & { sessionId?: string | null }): Promise<string> {
    const id = randomUUID();
    this.calls.push({ ...call, id });
    return id;
  }

  topicState(userId: string, topicId: string): TopicStatus {
    return this.topicStatus.get(statusKey(userId, topicId)) ?? "recommendable";
  }

  private rememberPoint(point: StoredPoint | undefined): void {
    if (!point) return;
    const exists = this.points.some(
      (item) => item.messageId === point.messageId && item.kind === point.kind && item.point === point.point,
    );
    if (!exists) this.points.push(point);
  }
}

function statusKey(userId: string, topicId: string): string {
  return `${userId}:${topicId}`;
}
