import { contentWords } from "@/lib/conversation/guard";
import type { AnswerLength, Classification, Distress, DoNotWriteScope, RefusalScope } from "@/lib/types";

const REFUSAL =
  /rather not|rather skip|lets skip|let us skip|skip that|skip it|lets move on|let us move on|move on from|talk about something else|thats private|thats personal|dont want to (talk|go|get into)|do not want to (talk|go)|none of your business|not going to talk about|leave that alone/;

const TOPIC_SCOPE =
  /this topic|whole (thing|topic)|any of this|all of this|stop asking|dont ask me about|never ask|altogether|whole \w+ thing/;

const STOP =
  /enough for today|im tired|i am tired|call it a day|want to stop|need to stop|stop for today|done for today|lets stop|worn out|pick it up tomorrow|save this|save (this|the story|it) for (now|later)|im done for today/;

const STRONG =
  /this hurts|still hurts|hurts to talk|im crying|i am crying|cant talk about this|cannot talk about this|too painful|this is painful|this is too much/;

const MILD = /\b(sad|miss them|miss her|miss him|lonely)\b/;

const DO_NOT_WRITE =
  /don.?t (put|write)|do not (put|write)|between us|leave that out|not in the book|written down|out of the book/;

const DO_NOT_WRITE_TOPIC =
  /whole (topic|thing|story)|any of this|none of this|all of (this|that)|everything about/;

const DONT_REMEMBER = /\b(dont|do not|cant|cannot|can not) remember\b|\bi forget\b|\bno memory of\b/;

const CHAPTER_HINTS: [RegExp, string][] = [
  [/\b(my job|at work|my boss|when i retired|my career)\b/, "work"],
  [/\b(my wife|my husband|our wedding|my kids|my son|my daughter)\b/, "love"],
  [/\b(the army|the navy|basic training|when i was drafted)\b/, "service"],
];

export function classifyHeuristic(message: string, lastQuestion: string | null): Classification {
  const normalized = message.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();
  const refusal = REFUSAL.test(normalized);
  const scope: RefusalScope = !refusal ? "none" : TOPIC_SCOPE.test(normalized) ? "topic" : "point";
  let distress: Distress = "none";
  if (STRONG.test(normalized)) distress = "strong";
  else if (MILD.test(normalized)) distress = "mild";

  let offTopicChapter: string | null = null;
  for (const [pattern, chapter] of CHAPTER_HINTS) {
    if (pattern.test(normalized)) {
      offTopicChapter = chapter;
      break;
    }
  }

  const doNotWrite = DO_NOT_WRITE.test(normalized);
  const doNotWriteScope: DoNotWriteScope = !doNotWrite
    ? "none"
    : DO_NOT_WRITE_TOPIC.test(normalized)
      ? "topic"
      : "point";

  return {
    refusal,
    refusalScope: scope,
    refusedPoint: refusal ? refusedPoint(normalized, lastQuestion) : null,
    offTopicChapter,
    wantsToStop: STOP.test(normalized),
    distress,
    answerLength: answerLength(message),
    doNotWrite,
    doNotWriteScope,
  };
}

export function isDontRemember(message: string): boolean {
  const normalized = message.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();
  return DONT_REMEMBER.test(normalized) && !REFUSAL.test(normalized);
}

export function pointForDoNotWrite(message: string, lastQuestion: string | null): string {
  const normalized = message.toLowerCase().replace(/['’]/g, "");
  const about = normalized.match(/\babout\s+([a-z0-9' ]{0,40})/);
  if (about?.[1]) {
    const words = contentWords(about[1]);
    if (words.length > 0) return words.slice(0, 6).join(" ");
  }
  const words = contentWords(message).filter(
    (word) => !["dont", "write", "book", "please", "still", "hurts", "want", "stop", "today", "name"].includes(word),
  );
  if (words.length > 0) return words.slice(0, 6).join(" ");
  if (lastQuestion) {
    const fromQuestion = contentWords(lastQuestion);
    if (fromQuestion.length > 0) return fromQuestion.slice(0, 6).join(" ");
  }
  return "that detail";
}

export function answerLength(message: string): AnswerLength {
  const words = message.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 12) return "very_short";
  if (words.length <= 45) return "short";
  return "rich";
}

function refusedPoint(normalized: string, lastQuestion: string | null): string {
  const about = normalized.match(/\babout\s+(.{0,48})/);
  if (about?.[1]) {
    const phrase = about[1].replace(/[.!?].*$/, "").trim();
    const words = contentWords(phrase);
    if (words.length > 0) return words.slice(0, 6).join(" ");
  }
  if (lastQuestion) {
    const words = contentWords(lastQuestion);
    if (words.length > 0) return words.slice(0, 6).join(" ");
  }
  return "that subject";
}
