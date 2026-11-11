import { loadChapters } from "@/lib/config/catalog";
import { loadPrompts } from "@/lib/config/prompts";
import type { ModelClient } from "@/lib/ai/mock";
import { isDontRemember, pointForDoNotWrite } from "@/lib/conversation/classify";
import { assembleContext, renderInterviewPrompt, type ContextTurn } from "@/lib/conversation/context";
import { decideTurn, trailingTopicRefusals } from "@/lib/conversation/decide";
import {
  enforceOneQuestion,
  fallbackQuestion,
  mentionsRefusedPoint,
  replyProblem,
  safeRefusalTemplate,
  withDoNotWriteAck,
} from "@/lib/conversation/guard";
import { mergeClassifications, sanitizeClassification } from "@/lib/conversation/merge";
import { RICKY_NAME } from "@/lib/constants";
import type { ConversationRepo } from "@/lib/repo/types";
import type { Classification, Message, ModelCallRecord, Session } from "@/lib/types";

export interface TurnHooks {
  onUserSaved?: (message: Message) => void;
}

export interface TurnResult {
  userMessage: Message;
  assistantMessage: Message;
  classification: Classification;
  decisionKind: string;
  replayed: boolean;
  repairs: string[];
  calls: ModelCallRecord[];
  session: Session;
}

export async function runTurn(
  repo: ConversationRepo,
  ai: ModelClient,
  input: { sessionId: string; userId: string; messageId: string; content: string },
  hooks?: TurnHooks,
): Promise<TurnResult> {
  const saved = await ingestUserMessage(repo, ai, input);
  hooks?.onUserSaved?.(saved.message);
  return completeTurn(repo, ai, { sessionId: input.sessionId, userId: input.userId });
}

export async function ingestUserMessage(
  repo: ConversationRepo,
  ai: ModelClient,
  input: { sessionId: string; userId: string; messageId: string; content: string },
): Promise<{ message: Message; classification: Classification; calls: ModelCallRecord[] }> {
  const session = await repo.getSession(input.sessionId);
  if (!session || session.status !== "open") throw new Error("Session is not open");
  const content = input.content.trim();
  if (!content) throw new Error("Empty message");
  const saved = await repo.insertUserMessage({
    id: input.messageId,
    sessionId: input.sessionId,
    userId: input.userId,
    content,
  });
  const existing = await repo.getClassification(saved.message.id);
  if (existing) return { message: saved.message, classification: existing, calls: [] };

  const prior = await repo.listMessages(input.sessionId);
  const lastQuestion = [...prior].reverse().find((message) => message.role === "assistant" && message.id !== saved.message.id);
  const topic = session.topicId ? await repo.getTopic(session.topicId) : null;
  const chapters = loadChapters().map((chapter) => chapter.id);
  const prompt = [
    `Topic: ${topic?.title.en ?? "free"}`,
    `Last question: ${lastQuestion?.content ?? "(none)"}`,
    `Chapter ids: ${chapters.join(", ")}`,
    `User message: ${content}`,
  ].join("\n");
  const classified = await ai.classify({ system: loadPrompts().classify, prompt });
  const classification = sanitizeClassification(classified.classification, new Set(chapters));
  const callId = await repo.logModelCall({ ...classified.call, userId: input.userId, sessionId: input.sessionId });
  await repo.saveClassification(saved.message.id, classification, callId);
  return { message: saved.message, classification, calls: [{ ...classified.call }] };
}

export async function completeTurn(
  repo: ConversationRepo,
  ai: ModelClient,
  input: { sessionId: string; userId: string },
): Promise<TurnResult> {
  const session = await repo.getSession(input.sessionId);
  if (!session) throw new Error("Session not found");
  const messages = await repo.listMessages(input.sessionId);
  const pending = pendingUserMessages(messages);
  if (pending.length === 0) {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const reply = lastUser ? await repo.findAssistantReply(lastUser.id) : null;
    const sessionNow = await repo.getSession(input.sessionId);
    if (lastUser && reply && sessionNow) {
      const stored = await repo.getClassification(lastUser.id);
      return {
        userMessage: lastUser,
        assistantMessage: reply,
        classification: stored ?? mergeClassifications([]),
        decisionKind: "replay",
        replayed: true,
        repairs: [],
        calls: [],
        session: sessionNow,
      };
    }
    throw new Error("No user message to answer");
  }
  const lastUser = pending[pending.length - 1];
  if (!lastUser) throw new Error("No user message to answer");

  const existingReply = await repo.findAssistantReply(lastUser.id);
  const stored = await repo.listClassifications(input.sessionId);
  const byId = new Map(stored.map((item) => [item.messageId, item.classification]));
  const bundle = pending.map((message) => byId.get(message.id)).filter((item): item is Classification => item != null);
  const classification = mergeClassifications(bundle);
  if (existingReply) {
    return {
      userMessage: lastUser,
      assistantMessage: existingReply,
      classification,
      decisionKind: "replay",
      replayed: true,
      repairs: [],
      calls: [],
      session,
    };
  }

  const previous = stored
    .filter((item) => !pending.some((message) => message.id === item.messageId))
    .map((item) => item.classification);
  const refusalPoints = await repo.listRefusalPoints(input.userId, session.topicId);
  const userText = pending.map((message) => message.content).join("\n");
  const priorDontRemember = messages.filter(
    (message) => message.role === "user" && !pending.some((item) => item.id === message.id) && isDontRemember(message.content),
  ).length;
  const decision = decideTurn({
    classification,
    followupsUsed: session.followupsUsed,
    extendedByUser: session.extendedByUser,
    awaiting: session.awaiting,
    consecutiveTopicRefusals: trailingTopicRefusals(previous, classification),
    userText,
    refusedPoints: refusalPoints,
    priorDontRemember,
  });

  const calls: ModelCallRecord[] = [];
  const repairs: string[] = [];
  const blockedPoints = [
    ...refusalPoints,
    ...(classification.refusedPoint ? [classification.refusedPoint] : []),
    ...(classification.doNotWrite ? [pointForDoNotWrite(userText, null)] : []),
  ];
  let text = decision.template ?? "";
  if (decision.useModel) {
    const rendered = await renderForSession(
      repo,
      session,
      input.userId,
      messages,
      classification,
      userText,
      priorDontRemember,
    );
    const first = await ai.interview(rendered);
    calls.push(first.call);
    await repo.logModelCall({ ...first.call, userId: input.userId, sessionId: session.id });
    text = first.text;
    const problem = replyProblem(text, blockedPoints);
    if (problem && problem.code !== "missing_question") {
      repairs.push(problem.code);
      const second = await ai.interview({
        ...rendered,
        prompt: `${rendered.prompt}\n\nYour previous reply was rejected (${problem.code}). Reply again with exactly one open question and one question mark.`,
      });
      calls.push(second.call);
      await repo.logModelCall({ ...second.call, userId: input.userId, sessionId: session.id });
      text = second.text;
    }
    const enforced = enforceOneQuestion(text);
    if (enforced.trimmed) repairs.push("trimmed_to_first_question");
    text = enforced.text;
  }

  if (classification.doNotWrite && decision.expectsQuestion) {
    const acked = withDoNotWriteAck(text, blockedPoints);
    if (acked !== text) repairs.push("do_not_write_ack");
    text = acked;
  } else if (!decision.expectsQuestion) {
    text = text.replace(/[?\uFF1F].*$/s, "").trim() || text;
    if (countQuestionsSafe(text) > 0) text = text.split(/[?\uFF1F]/)[0]?.replace(/[?\uFF1F]/g, "").trim() ?? text;
  } else if (countQuestionsSafe(text) !== 1 || mentionsRefusedPoint(text, refusalPoints)) {
    repairs.push("safe_fallback");
    text = classification.refusal ? safeRefusalTemplate(blockedPoints) : fallbackQuestion(blockedPoints, true);
  }

  const points = pending.flatMap((message) => {
    const item = byId.get(message.id);
    if (!item) return [];
    const marked: { userId: string; topicId: string | null; point: string; messageId: string; kind: "refusal" | "do_not_write" }[] = [];
    if (item.refusal && item.refusedPoint) {
      marked.push({
        userId: input.userId,
        topicId: session.topicId,
        point: item.refusedPoint,
        messageId: message.id,
        kind: "refusal",
      });
    }
    if (item.doNotWrite) {
      marked.push({
        userId: input.userId,
        topicId: session.topicId,
        point: pointForDoNotWrite(message.content, null),
        messageId: message.id,
        kind: "do_not_write",
      });
    }
    return marked;
  });
  const committed = await repo.commitAssistantTurn({
    sessionId: session.id,
    userId: input.userId,
    inReplyTo: lastUser.id,
    content: text,
    kind: decision.messageKind,
    countsAsFollowUp: decision.countsAsFollowUp,
    setExtended: decision.setExtended,
    setAwaiting: decision.setAwaiting,
    clearAwaiting: decision.clearAwaiting,
    endSession: decision.endSession,
    points,
    markTopicDoNotWrite:
      decision.markTopicDoNotWrite && session.topicId
        ? { userId: input.userId, topicId: session.topicId }
        : undefined,
  });

  return {
    userMessage: lastUser,
    assistantMessage: committed.message,
    classification,
    decisionKind: decision.kind,
    replayed: !committed.inserted,
    repairs,
    calls,
    session: committed.session,
  };
}

async function renderForSession(
  repo: ConversationRepo,
  session: Session,
  userId: string,
  messages: Message[],
  classification: Classification,
  userText: string,
  dontRememberPrior: number,
): Promise<{ system: string; prompt: string }> {
  const topic = session.topicId ? await repo.getTopic(session.topicId) : null;
  const blocked = await repo.listDoNotWrite(userId);
  const memory = await repo.getMemory(userId, session.topicId);
  const recentTurns: ContextTurn[] = messages.slice(-8).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const context = assembleContext({
    userName: RICKY_NAME,
    topic: topic
      ? {
          id: topic.id,
          titleEn: topic.title.en,
          openingQuestion: topic.openingQuestion,
          followUps: topic.followUps,
        }
      : null,
    recentTurns,
    profile: memory.profile,
    people: memory.people,
    storySummaries: memory.storySummaries,
    followUpsUsed: session.followupsUsed,
    extendedByUser: session.extendedByUser,
    refusedPoints: await repo.listRefusalPoints(userId, session.topicId),
    doNotWriteTopics: blocked,
    openingGap: memory.openingGap,
    signals: {
      refusalNow: classification.refusal,
      distress: classification.distress,
      wantsToStop: classification.wantsToStop,
      doNotWriteNow: classification.doNotWrite,
      answerLength: classification.answerLength,
      dontRemember: isDontRemember(userText),
      dontRememberPrior,
    },
  });
  return renderInterviewPrompt(loadPrompts().interview, context);
}

function pendingUserMessages(messages: Message[]): Message[] {
  let start = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      start = index + 1;
      break;
    }
  }
  return messages.slice(start).filter((message) => message.role === "user");
}

function countQuestionsSafe(text: string): number {
  return text.match(/[?\uFF1F]/g)?.length ?? 0;
}
