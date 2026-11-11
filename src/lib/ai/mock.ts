import { classifyHeuristic } from "@/lib/conversation/classify";
import {
  DISTRESS_TEMPLATE,
  DONT_REMEMBER_TEMPLATE,
  STOP_TEMPLATE,
  enforceOneQuestion,
  fallbackQuestion,
  isLeading,
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
    return fallbackQuestion([], true);
  }
  const refused = field(prompt, "Refused points:");
  const points = refused === "(none)" ? [] : refused.split("|").map((item) => item.trim()).filter(Boolean);
  if (field(prompt, "Wants to stop:") === "true") return STOP_TEMPLATE;
  if (field(prompt, "Distress:") === "strong") return DISTRESS_TEMPLATE;
  if (field(prompt, "Refusal now:") === "true") return safeRefusalTemplate(points);
  if (field(prompt, "Dont remember:") === "true") return DONT_REMEMBER_TEMPLATE;

  const turns = prompt.split("\n").filter((line) => line.startsWith("Them:"));
  const lastUser = turns[turns.length - 1]?.slice("Them:".length).trim() ?? "";
  const echo = echoDetail(lastUser);
  const used = Number(field(prompt, "Follow-ups used:")) || 0;
  const suggestions = field(prompt, "Suggested follow-ups:");
  const followUps = suggestions === "(none)" ? [] : suggestions.split("|").map((item) => item.trim()).filter(Boolean);
  const raw = followUps[Math.min(used, Math.max(followUps.length - 1, 0))] ?? "What do you remember most clearly about that?";
  const firstAsk = raw.split(/[?\uFF1F]/)[0]?.trim() || "What do you remember most clearly about that";
  let question = isLeading(firstAsk) ? "What do you remember most clearly about that?" : `${firstAsk.replace(/\?$/, "")}?`;
  if (field(prompt, "Answer length:") === "very_short") {
    question = "What do you see when you picture that?";
  }
  let text = echo ? `${echo} ${question}` : question;
  text = enforceOneQuestion(text).text;
  if (field(prompt, "Do not write now:") === "true") text = withDoNotWriteAck(text, points);
  return text;
}

function echoDetail(text: string): string {
  const words = text.replace(/[?!.]/g, "").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length === 0) return "";
  const phrase = words.join(" ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1) + ".";
}
