import { GatewayModelClient } from "@/lib/ai/gateway";
import { MockModelClient, type ModelClient } from "@/lib/ai/mock";

export function resolveAiMode(): "mock" | "live" {
  if (process.env.AI_MODE === "live" && process.env.AI_GATEWAY_API_KEY) return "live";
  return "mock";
}

export function createModelClient(): ModelClient {
  return resolveAiMode() === "live" ? new GatewayModelClient() : new MockModelClient();
}

export type { ModelClient };
