import { isDontRemember, isEmotionalGap } from "@/lib/conversation/classify";
import { acknowledgesDoNotWrite, countQuestions, isLeading, steersAway } from "@/lib/conversation/guard";
import type { Distress } from "@/lib/types";

export type RubricMark = "pass" | "fail" | "n/a";

/** A11. A short answer that is not "I don't remember" stays on the point with one small question. */
export function scoreShortAnswer(userText: string, reply: string): RubricMark {
  const words = userText.trim().split(/\s+/).filter(Boolean);
  if (words.length > 12 || isDontRemember(userText)) return "n/a";
  if (/\b(rather not|rather skip|enough for today|want to stop)\b/i.test(userText)) return "n/a";
  const oneQuestion = countQuestions(reply) === 1;
  const pressures = /what year|how old were you|think harder/i.test(reply) || isLeading(reply);
  return oneQuestion && !pressures ? "pass" : "fail";
}

/**
 * A15. First "I don't remember" gets reassurance plus one easy sensory hook.
 * A second time on the topic, or one said with feeling, gets reassurance and a switch, with no new hook.
 */
export function scoreDontRemember(
  userText: string,
  priorCount: number,
  distress: Distress,
  reply: string,
): RubricMark {
  if (!isDontRemember(userText)) return "n/a";
  const second = priorCount >= 1 || isEmotionalGap(userText, distress);
  const reassures = /that'?s okay|that is okay|a lot of people don't/i.test(reply);
  const hook = /smell|picture|sound|taste/i.test(reply);
  const switches = /switch/i.test(reply);
  const pushes = /think harder/i.test(reply);
  if (!second) return reassures && hook && countQuestions(reply) === 1 && !pushes ? "pass" : "fail";
  return reassures && switches && !hook && countQuestions(reply) === 1 && !pushes ? "pass" : "fail";
}

/**
 * Do-not-write, when the elder is still talking: exactly one brief
 * "this stays out of the book" line, then the same conversation. Steering
 * away fails. If they also asked to stop, the ack plus a clean ending passes.
 * Strong distress keeps its own support question.
 */
export function scoreDoNotWriteHandled(
  reply: string,
  signals: { wantsToStop: boolean; distress: string } = { wantsToStop: false, distress: "none" },
): RubricMark {
  const sentences = reply
    .split(/(?<=[.!])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const acks = sentences.filter((sentence) => acknowledgesDoNotWrite(sentence));
  if (acks.length !== 1) return "fail";
  const words = acks[0]?.split(/\s+/).filter(Boolean).length ?? 0;
  if (words > 14) return "fail";
  if (signals.wantsToStop) return countQuestions(reply) === 0 ? "pass" : "fail";
  if (signals.distress === "strong") return countQuestions(reply) === 1 ? "pass" : "fail";
  if (countQuestions(reply) !== 1) return "fail";
  if (steersAway(reply)) return "fail";
  return "pass";
}
