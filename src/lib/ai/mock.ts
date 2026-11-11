import { classifyHeuristic } from "@/lib/conversation/classify";
import {
  DISTRESS_TEMPLATE,
  DONT_REMEMBER_FIRST,
  DONT_REMEMBER_SWITCH,
  STOP_TEMPLATE,
  enforceOneQuestion,
  fallbackQuestion,
  isLeading,
  mentionsRefusedPoint,
  safeRefusalTemplate,
  withDoNotWriteAck,
} from "@/lib/conversation/guard";
import { estimateCostUsd, estimateTokens, providerOf, stepSpec } from "@/lib/config/models";
import type { Classification, ModelCallRecord, ModelStep } from "@/lib/types";

export interface ModelClient {
  classify(input: { system: string; prompt: string }): Promise<{
    classification: Classification;
    call: ModelCallRecord;
  }>;
  interview(input: { system: string; prompt: string }): Promise<{ text: string; call: ModelCallRecord }>;
}

function field(prompt: string, label: string): string {
  const line = prompt.split("\n").find((item) => item.startsWith(label));
  return line ? line.slice(label.length).trim() : "";
}

function record(step: ModelStep, model: string, input: string, output: string): ModelCallRecord {
  const inputTokens = estimateTokens(input);
  const outputTokens = estimateTokens(output);
  return {
    step,
    provider: providerOf(model),
    model,
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(model, inputTokens, outputTokens),
    latencyMs: 2,
    firstTokenMs: 1,
    ok: true,
    error: null,
  };
}

export class MockModelClient implements ModelClient {
  async classify(input: { system: string; prompt: string }): Promise<{
    classification: Classification;
    call: ModelCallRecord;
  }> {
    const message = field(input.prompt, "User message:");
    const lastQuestion = field(input.prompt, "Last question:");
    const classification = classifyHeuristic(message, lastQuestion === "(none)" ? null : lastQuestion);
    const model = stepSpec("classify").id;
    return {
      classification,
      call: record("classify", model, input.system + input.prompt, JSON.stringify(classification)),
    };
  }

  async interview(input: { system: string; prompt: string }): Promise<{ text: string; call: ModelCallRecord }> {
    const text = mockInterview(input.prompt);
    const model = stepSpec("interview").id;
    return { text, call: record("interview", model, input.system + input.prompt, text) };
  }
}

export function mockInterview(prompt: string): string {
  if (prompt.includes("previous reply was rejected")) {
    return fallbackQuestion(pointsFrom(prompt), true);
  }
  const points = pointsFrom(prompt);
  if (field(prompt, "Wants to stop:") === "true") return STOP_TEMPLATE;
  if (field(prompt, "Distress:") === "strong") return DISTRESS_TEMPLATE;
  if (field(prompt, "Refusal now:") === "true") return safeRefusalTemplate(points);
  if (field(prompt, "Dont remember:") === "true") {
    const prior = Number(field(prompt, "Dont remember prior:")) || 0;
    const distress = field(prompt, "Distress:");
    if (prior >= 1 || (distress !== "" && distress !== "none")) return DONT_REMEMBER_SWITCH;
    return DONT_REMEMBER_FIRST;
  }

  const turns = prompt.split("\n").filter((line) => line.startsWith("Them:"));
  const lastUser = turns[turns.length - 1]?.slice("Them:".length).trim() ?? "";
  const echo = echoDetail(lastUser);
  const used = Number(field(prompt, "Follow-ups used:")) || 0;
  const suggestions = field(prompt, "Suggested follow-ups:");
  const followUps = suggestions === "(none)" ? [] : suggestions.split("|").map((item) => item.trim()).filter(Boolean);
  const ordered = followUps.slice(used).concat(followUps.slice(0, used));
  const raw = ordered.find((item) => !mentionsRefusedPoint(item, points)) ?? fallbackQuestion(points, true);
  const firstAsk = raw.split(/[?\uFF1F]/)[0]?.trim() || "What do you remember most clearly about that";
  let question = isLeading(firstAsk) ? "What do you remember most clearly about that?" : `${firstAsk.replace(/\?$/, "")}?`;
  if (mentionsRefusedPoint(question, points)) question = fallbackQuestion(points, true);
  if (field(prompt, "Answer length:") === "very_short") {
    const smaller = "What's one small thing you can picture about that?";
    question = mentionsRefusedPoint(smaller, points) ? fallbackQuestion(points, true) : smaller;
  }
  let text = echo ? `${echo} ${question}` : question;
  text = enforceOneQuestion(text).text;
  if (field(prompt, "Do not write now:") === "true") text = withDoNotWriteAck(text, points);
  return text;
}

function pointsFrom(prompt: string): string[] {
  const refused = field(prompt, "Refused points:");
  if (refused === "(none)") return [];
  return refused.split("|").map((item) => item.trim()).filter(Boolean);
}

const DANGLING = new Set([
  "a",
  "an",
  "the",
  "of",
  "on",
  "in",
  "to",
  "for",
  "with",
  "at",
  "from",
  "and",
  "or",
  "but",
  "my",
  "your",
  "was",
  "were",
  "is",
  "are",
  "had",
  "have",
  "it",
  "that",
  "this",
]);

/** A short grammatical echo. Does not stop on a dangling article or auxiliary. */
export function echoDetail(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const clause = (cleaned.split(/[.!?]/)[0] ?? cleaned).split(",")[0]?.trim() ?? cleaned;
  const words = clause.split(/\s+/).filter(Boolean);
  const kept = closePhrase(words);
  if (kept.length === 0) return "";
  const phrase = kept.join(" ");
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`;
}

function closePhrase(words: string[]): string[] {
  const limited = words.slice(0, 12);
  let end = limited.length;
  while (end > 0 && DANGLING.has(wordKey(limited[end - 1] ?? ""))) end -= 1;
  // "it was a white" cut off before "house": pull in the next word.
  if (
    end >= 2 &&
    end < words.length &&
    ["a", "an", "the"].includes(wordKey(limited[end - 2] ?? "")) &&
    words[end]
  ) {
    return trimDangling([...limited.slice(0, end), words[end] ?? ""]);
  }
  return limited.slice(0, end);
}

function trimDangling(words: string[]): string[] {
  const copy = words.slice();
  while (copy.length > 0 && DANGLING.has(wordKey(copy[copy.length - 1] ?? ""))) copy.pop();
  return copy;
}

function wordKey(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, "");
}
