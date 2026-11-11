export type Locale = "en" | "zh";

export type EntryMode = "topic" | "continue" | "tell_more" | "free";

export type SessionStatus = "open" | "ended" | "abandoned";

export type Awaiting = "cap_opt_in" | "do_not_write_confirm";

export type TopicStatus = "recommendable" | "told" | "not_now" | "do_not_write";

export type MessageRole = "user" | "assistant";

export type MessageKind =
  | "user_turn"
  | "opening"
  | "follow_up"
  | "extended_follow_up"
  | "cap_prompt"
  | "refusal_redirect"
  | "distress_ack"
  | "stop_ack"
  | "do_not_write_prompt"
  | "gap_question"
  | "free_opener"
  | "continue_recap"
  | "reassure_switch";

export type RefusalScope = "none" | "point" | "topic";

export type Distress = "none" | "mild" | "strong";

export type AnswerLength = "very_short" | "short" | "rich";

export type DoNotWriteScope = "none" | "point" | "topic";

export interface Classification {
  refusal: boolean;
  refusalScope: RefusalScope;
  refusedPoint: string | null;
  offTopicChapter: string | null;
  wantsToStop: boolean;
  distress: Distress;
  answerLength: AnswerLength;
  /** Willing to talk, but this must not go in the book. */
  doNotWrite: boolean;
  doNotWriteScope: DoNotWriteScope;
}

export interface Message {
  id: string;
  sessionId: string;
  userId: string;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  locale: string;
  inReplyTo: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  topicId: string | null;
  storyId: string | null;
  entryMode: EntryMode;
  followupsUsed: number;
  extendedByUser: boolean;
  awaiting: Awaiting | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
}

export interface TopicContent {
  id: string;
  chapterId: string;
  title: { en: string; zh: string };
  openingQuestion: string;
  /** Short line for the home card. The opening question stays on the story page. */
  cardHint: string;
  followUps: string[];
  sensitive: boolean;
  recommendByDefault: boolean;
  recommendRank: number | null;
}

export interface TopicWithStatus extends TopicContent {
  status: TopicStatus;
  storyCount?: number;
  inProgress?: boolean;
}

export type ModelStep =
  | "classify"
  | "interview"
  | "extract"
  | "structure"
  | "draft"
  | "verify"
  | "chapter"
  | "simulatedElder"
  | "judge";

export interface ModelCallRecord {
  step: ModelStep;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
  firstTokenMs: number | null;
  ok: boolean;
  error: string | null;
}
