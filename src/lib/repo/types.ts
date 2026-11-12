import type {
  Awaiting,
  Classification,
  EntryMode,
  Message,
  MessageKind,
  ModelCallRecord,
  Session,
  SessionStatus,
  TopicContent,
  TopicStatus,
} from "@/lib/types";

export class IdempotencyConflict extends Error {
  constructor(message = "Message id was already used with different content") {
    super(message);
    this.name = "IdempotencyConflict";
  }
}

export interface MemoryBundle {
  profile: { key: string; value: string }[];
  people: { name: string; relation: string | null }[];
  storySummaries: { topicId: string | null; summary: string }[];
  openingGap: { id: string; nextQuestion: string } | null;
}

export interface RefusedPointInput {
  userId: string;
  topicId: string | null;
  point: string;
  messageId: string;
  kind: "refusal" | "do_not_write";
}

export interface CommitTurnInput {
  sessionId: string;
  userId: string;
  inReplyTo: string;
  content: string;
  kind: MessageKind;
  countsAsFollowUp: boolean;
  setExtended: boolean;
  setAwaiting: Awaiting | null;
  clearAwaiting: boolean;
  endSession: boolean;
  points?: RefusedPointInput[];
  markTopicDoNotWrite?: { userId: string; topicId: string };
}

export interface ConversationRepo {
  createSession(input: {
    userId: string;
    topicId: string | null;
    entryMode: EntryMode;
    opening: { content: string; kind: MessageKind };
  }): Promise<{ session: Session; messages: Message[] }>;
  getSession(id: string): Promise<Session | null>;
  listMessages(sessionId: string): Promise<Message[]>;
  insertUserMessage(input: {
    id: string;
    sessionId: string;
    userId: string;
    content: string;
  }): Promise<{ message: Message; inserted: boolean }>;
  findAssistantReply(userMessageId: string): Promise<Message | null>;
  getClassification(messageId: string): Promise<Classification | null>;
  saveClassification(messageId: string, classification: Classification, modelCallId: string | null): Promise<void>;
  listClassifications(sessionId: string): Promise<{ messageId: string; classification: Classification }[]>;
  commitAssistantTurn(input: CommitTurnInput): Promise<{ message: Message; session: Session; inserted: boolean }>;
  getTopic(topicId: string): Promise<TopicContent | null>;
  listDoNotWrite(userId: string): Promise<{ id: string; titleEn: string }[]>;
  listRefusalPoints(userId: string, topicId: string | null): Promise<string[]>;
  getMemory(userId: string, topicId: string | null): Promise<MemoryBundle>;
  findLatestOpenSession(userId: string): Promise<Session | null>;
  findOpenSessionForTopic(userId: string, topicId: string): Promise<Session | null>;
  findOpenFreeSession(userId: string): Promise<Session | null>;
  endSession(id: string, status: Extract<SessionStatus, "ended" | "abandoned">): Promise<void>;
  setTopicStatus(userId: string, topicId: string, status: TopicStatus): Promise<void>;
  getTopicReflection(userId: string, topicId: string): Promise<{
    asked: boolean;
    meaning: string | null;
    meaningMessageId: string | null;
  }>;
  markReflectionAsked(userId: string, topicId: string): Promise<void>;
  saveTopicMeaning(userId: string, topicId: string, text: string, messageId: string): Promise<void>;
  logModelCall(call: ModelCallRecord & { userId?: string; sessionId?: string | null }): Promise<string>;
}
