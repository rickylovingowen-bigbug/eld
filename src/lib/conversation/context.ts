import { RECENT_TURN_LIMIT } from "@/lib/constants";
import { fillTemplate } from "@/lib/config/prompts";
import type { Classification } from "@/lib/types";

export interface ContextTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ContextTopic {
  id: string;
  titleEn: string;
  openingQuestion: string;
  followUps: string[];
}

export interface OpeningGap {
  id: string;
  nextQuestion: string;
}

export interface ContextParts {
  userName: string;
  topic: ContextTopic | null;
  recentTurns: ContextTurn[];
  profile: { key: string; value: string }[];
  people: { name: string; relation: string | null }[];
  storySummaries: { topicId: string | null; summary: string }[];
  followUpsUsed: number;
  extendedByUser: boolean;
  refusedPoints: string[];
  doNotWriteTopics: { id: string; titleEn: string }[];
  /** v0.2 fills this from followup_gaps. v0.1 leaves it null unless a row already exists. */
  openingGap: OpeningGap | null;
  signals: {
    refusalNow: boolean;
    distress: Classification["distress"];
    wantsToStop: boolean;
    doNotWriteNow: boolean;
    answerLength: Classification["answerLength"];
    dontRemember: boolean;
  };
}

export interface InterviewContext {
  userName: string;
  topic: ContextTopic | null;
  recentTurns: ContextTurn[];
  profile: { key: string; value: string }[];
  people: { name: string; relation: string | null }[];
  storySummaries: { topicId: string | null; summary: string }[];
  followUpsUsed: number;
  extendedByUser: boolean;
  refusedPoints: string[];
  openingGap: OpeningGap | null;
  signals: ContextParts["signals"];
  excludedTopicIds: string[];
}

export function assembleContext(input: ContextParts): InterviewContext {
  const excluded = new Set(input.doNotWriteTopics.map((topic) => topic.id));
  const topic = input.topic && excluded.has(input.topic.id) ? null : input.topic;
  return {
    userName: input.userName,
    topic,
    recentTurns: input.recentTurns.slice(-RECENT_TURN_LIMIT),
    profile: input.profile,
    people: input.people,
    storySummaries: input.storySummaries.filter(
      (story) => story.topicId == null || !excluded.has(story.topicId),
    ),
    followUpsUsed: input.followUpsUsed,
    extendedByUser: input.extendedByUser,
    refusedPoints: input.refusedPoints,
    openingGap: input.openingGap,
    signals: input.signals,
    excludedTopicIds: [...excluded],
  };
}

export function renderInterviewPrompt(
  template: string,
  ctx: InterviewContext,
): { system: string; prompt: string } {
  const system = fillTemplate(template, {
    user_name: ctx.userName,
    follow_ups_used: String(ctx.followUpsUsed),
    refused_points: ctx.refusedPoints.join("; ") || "(none)",
    refusal_now: String(ctx.signals.refusalNow),
    distress: ctx.signals.distress,
    do_not_write_now: String(ctx.signals.doNotWriteNow),
    wants_to_stop: String(ctx.signals.wantsToStop),
    opening_gap: ctx.openingGap?.nextQuestion ?? "",
    topic_en: ctx.topic?.titleEn ?? "Free conversation",
    opening_question: ctx.topic?.openingQuestion ?? "",
    follow_ups: ctx.topic?.followUps.join(" | ") || "(none)",
    profile: ctx.profile.map((item) => `${item.key}: ${item.value}`).join("; ") || "(none yet)",
    people:
      ctx.people.map((person) => `${person.name}${person.relation ? ` (${person.relation})` : ""}`).join("; ") ||
      "(none yet)",
    story_summaries: ctx.storySummaries.map((story) => story.summary).join(" | ") || "(none yet)",
  });
  const prompt = [
    `Follow-ups used: ${ctx.followUpsUsed}`,
    `Extended: ${ctx.extendedByUser}`,
    `Refusal now: ${ctx.signals.refusalNow}`,
    `Distress: ${ctx.signals.distress}`,
    `Do not write now: ${ctx.signals.doNotWriteNow}`,
    `Answer length: ${ctx.signals.answerLength}`,
    `Dont remember: ${ctx.signals.dontRemember}`,
    `Wants to stop: ${ctx.signals.wantsToStop}`,
    `Refused points: ${ctx.refusedPoints.join(" | ") || "(none)"}`,
    `Opening gap: ${ctx.openingGap?.nextQuestion ?? "(none)"}`,
    `Topic: ${ctx.topic?.titleEn ?? "free"}`,
    `Suggested follow-ups: ${ctx.topic?.followUps.join(" | ") || "(none)"}`,
    "Recent conversation:",
    ctx.recentTurns.length === 0
      ? "(none yet)"
      : ctx.recentTurns.map((turn) => `${turn.role === "user" ? "Them" : "You"}: ${turn.content}`).join("\n"),
    "",
    "Write the next interviewer reply.",
  ].join("\n");
  return { system, prompt };
}
