import { readJsonFile } from "@/lib/config/files";
import type { ModelStep } from "@/lib/types";

export interface StepSpec {
  id: string;
  backup: string | null;
  temperature: number | null;
  maxOutputTokens?: number;
  reasoningEffort: "none" | "medium" | "low" | "high" | null;
  structured: boolean;
}

interface ModelsFile {
  steps: Record<ModelStep, StepSpec>;
}

interface PricesFile {
  regionSurcharge?: number;
  models: Record<string, { inputPerMillion: number; outputPerMillion: number }>;
}

export function loadModelConfig(): ModelsFile {
  return readJsonFile<ModelsFile>("config/models.json");
}

export function loadPrices(): PricesFile {
  return readJsonFile<PricesFile>("config/prices.json");
}

export function stepSpec(step: ModelStep): StepSpec {
  const spec = loadModelConfig().steps[step];
  if (!spec) throw new Error(`No model config for step ${step}`);
  return spec;
}

/** Settings actually sent to the SDK. Verify omits temperature on purpose. */
export function callSettings(spec: StepSpec): {
  temperature?: number;
  maxOutputTokens?: number;
  reasoning?: "none" | "low" | "medium" | "high";
} {
  const settings: {
    temperature?: number;
    maxOutputTokens?: number;
    reasoning?: "none" | "low" | "medium" | "high";
  } = {};
  if (typeof spec.temperature === "number") settings.temperature = spec.temperature;
  if (spec.maxOutputTokens) settings.maxOutputTokens = spec.maxOutputTokens;
  if (spec.reasoningEffort) settings.reasoning = spec.reasoningEffort;
  return settings;
}

export function providerOf(model: string): string {
  const slash = model.indexOf("/");
  return slash === -1 ? "unknown" : model.slice(0, slash);
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const prices = loadPrices();
  const price = prices.models[model];
  if (!price) return null;
  const surcharge = prices.regionSurcharge ?? 0;
  const raw =
    ((inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) /
      1_000_000) *
    (1 + surcharge);
  return Math.round(raw * 1_000_000) / 1_000_000;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
