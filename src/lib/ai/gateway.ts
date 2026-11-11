import { generateText, Output, streamText } from "ai";
import { z } from "zod";
import { callSettings, providerOf, stepSpec, estimateCostUsd } from "@/lib/config/models";
import { sanitizeClassification } from "@/lib/conversation/merge";
import { loadChapters } from "@/lib/config/catalog";
import type { Classification, ModelCallRecord, ModelStep } from "@/lib/types";
import type { ModelClient } from "@/lib/ai/mock";

const classificationSchema = z.object({
  refusal: z.boolean(),
  refusal_scope: z.enum(["none", "point", "topic"]),
  refused_point: z.string().nullable(),
  off_topic_chapter: z.string().nullable(),
  wants_to_stop: z.boolean(),
  distress: z.enum(["none", "mild", "strong"]),
  answer_length: z.enum(["very_short", "short", "rich"]),
  do_not_write: z.boolean(),
  do_not_write_scope: z.enum(["none", "point", "topic"]),
});

export class GatewayModelClient implements ModelClient {
  async classify(input: { system: string; prompt: string }): Promise<{
    classification: Classification;
    call: ModelCallRecord;
  }> {
    const spec = stepSpec("classify");
    const result = await runStructured(spec.id, spec.backup, "classify", classificationSchema, input.system, input.prompt);
    const parsed = classificationSchema.parse(result.object);
    const chapters = new Set(loadChapters().map((chapter) => chapter.id));
    const classification = sanitizeClassification(
      {
        refusal: parsed.refusal,
        refusalScope: parsed.refusal_scope,
        refusedPoint: parsed.refused_point,
        offTopicChapter: parsed.off_topic_chapter,
        wantsToStop: parsed.wants_to_stop,
        distress: parsed.distress,
        answerLength: parsed.answer_length,
        doNotWrite: parsed.do_not_write,
        doNotWriteScope: parsed.do_not_write_scope,
      },
      chapters,
    );
    return { classification, call: result.call };
  }

  async interview(input: { system: string; prompt: string }): Promise<{ text: string; call: ModelCallRecord }> {
    const spec = stepSpec("interview");
    return streamPlain(spec.id, spec.backup, "interview", input.system, input.prompt);
  }
}

async function streamPlain(
  model: string,
  backup: string | null,
  step: ModelStep,
  system: string,
  prompt: string,
): Promise<{ text: string; call: ModelCallRecord }> {
  try {
    return await streamOnce(model, step, system, prompt);
  } catch (error) {
    if (!backup || backup === model) throw error;
    return streamOnce(backup, step, system, prompt);
  }
}

async function streamOnce(
  model: string,
  step: ModelStep,
  system: string,
  prompt: string,
): Promise<{ text: string; call: ModelCallRecord }> {
  const spec = { ...stepSpec(step), id: model };
  const started = Date.now();
  let firstTokenMs: number | null = null;
  const result = streamText({
    model,
    system,
    prompt,
    ...callSettings(spec),
    maxRetries: 0,
  });
  let text = "";
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      if (firstTokenMs == null) firstTokenMs = Date.now() - started;
      text += part.text;
    }
  }
  const usage = await result.usage;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    text: text.trim(),
    call: {
      step,
      provider: providerOf(model),
      model,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(model, inputTokens, outputTokens),
      latencyMs: Date.now() - started,
      firstTokenMs: firstTokenMs ?? Date.now() - started,
      ok: true,
      error: null,
    },
  };
}

async function runStructured<T extends z.ZodType>(
  model: string,
  backup: string | null,
  step: ModelStep,
  schema: T,
  system: string,
  prompt: string,
): Promise<{ object: z.infer<T>; call: ModelCallRecord }> {
  try {
    return await structuredOnce(model, step, schema, system, prompt);
  } catch (error) {
    if (!backup || backup === model) throw error;
    return structuredOnce(backup, step, schema, system, prompt);
  }
}

async function structuredOnce<T extends z.ZodType>(
  model: string,
  step: ModelStep,
  schema: T,
  system: string,
  prompt: string,
): Promise<{ object: z.infer<T>; call: ModelCallRecord }> {
  const spec = { ...stepSpec(step), id: model };
  const started = Date.now();
  const settings = callSettings(spec);
  const result = await generateText({
    model,
    system,
    prompt,
    ...settings,
    maxRetries: 0,
    output: Output.object({ schema, name: step }),
  });
  const usage = result.usage;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const latencyMs = Date.now() - started;
  return {
    object: result.output as z.infer<T>,
    call: {
      step,
      provider: providerOf(model),
      model,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(model, inputTokens, outputTokens),
      latencyMs,
      firstTokenMs: latencyMs,
      ok: true,
      error: null,
    },
  };
}
