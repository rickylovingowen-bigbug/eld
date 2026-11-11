import { GatewayModelClient } from "@/lib/ai/gateway";
import { MockModelClient, type ModelClient } from "@/lib/ai/mock";

/** A key, or the OIDC token Vercel injects for AI Gateway when no key is set. */
export function gatewayCredentialsPresent(): boolean {
  if (process.env.AI_GATEWAY_API_KEY?.trim()) return true;
  if (process.env.VERCEL_OIDC_TOKEN?.trim()) return true;
  return process.env.VERCEL === "1";
}

export function resolveAiMode(): "mock" | "live" {
  if (process.env.AI_MODE === "live" && gatewayCredentialsPresent()) return "live";
  return "mock";
}

export function createModelClient(): ModelClient {
  return resolveAiMode() === "live" ? new GatewayModelClient() : new MockModelClient();
}

export type { ModelClient };
