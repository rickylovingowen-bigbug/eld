import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  ACCESS_COOKIE,
  noteFailedAccess,
  passwordsMatch,
  resetAccessLimits,
  safeNextPath,
  signAccessToken,
  timingSafeEqualBytes,
  tooManyAccessAttempts,
  verifyAccessToken,
} from "@/lib/access";
import { gatewayCredentialsPresent, resolveAiMode } from "@/lib/ai/client";
import { dbTarget, sqlOptions } from "@/lib/db-options";
import { proxy } from "@/proxy";
import childhood from "../config/childhood-topics-v1.json";

describe("hosted database options", () => {
  it("keeps local Postgres without SSL and with prepared statements", () => {
    const url = "postgres://eld:eld@127.0.0.1:5432/eld";
    expect(dbTarget(url)).toEqual({ local: true, transactionPooler: false });
    expect(sqlOptions(url)).toMatchObject({ max: 10, prepare: true, ssl: false });
  });

  it("requires SSL, disables prepared statements, and uses one connection for the Supabase pooler", () => {
    const url = "postgres://user:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
    expect(dbTarget(url)).toEqual({ local: false, transactionPooler: true });
    expect(sqlOptions(url)).toMatchObject({ max: 1, prepare: false, ssl: "require" });
  });
});

describe("access gate", () => {
  it("compares passwords without leaking a length mismatch", async () => {
    expect(await passwordsMatch("right-password", "right-password")).toBe(true);
    expect(await passwordsMatch("no", "right-password")).toBe(false);
    expect(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqualBytes(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });

  it("signs a 90-day cookie and rejects a tampered or expired token", async () => {
    const now = Date.parse("2026-11-11T00:00:00Z");
    const token = await signAccessToken("secret", now);
    expect(await verifyAccessToken(token, "secret", now + 1000)).toBe(true);
    expect(await verifyAccessToken(token, "other", now + 1000)).toBe(false);
    expect(await verifyAccessToken(`${token}x`, "secret", now + 1000)).toBe(false);
    expect(await verifyAccessToken(token, "secret", now + 91 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("limits password failures per IP", () => {
    resetAccessLimits();
    const now = 1_000;
    for (let attempt = 0; attempt < 8; attempt += 1) noteFailedAccess("203.0.113.5", now);
    expect(tooManyAccessAttempts("203.0.113.5", now + 1)).toBe(true);
    expect(tooManyAccessAttempts("203.0.113.9", now + 1)).toBe(false);
    expect(tooManyAccessAttempts("203.0.113.5", now + 11 * 60 * 1000)).toBe(false);
    resetAccessLimits();
  });

  it("only allows a same-site next path", () => {
    expect(safeNextPath("/topics")).toBe("/topics");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/unlock")).toBe("/");
  });

  it("lets local dev through and sends everyone else to /unlock", async () => {
    const previous = process.env.ACCESS_PASSWORD;
    delete process.env.ACCESS_PASSWORD;
    const open = await proxy(new NextRequest("http://localhost:3000/topics"));
    expect(open.headers.get("location")).toBeNull();
    expect(open.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    process.env.ACCESS_PASSWORD = "secret";
    const blocked = await proxy(new NextRequest("https://memoir.example/topics"));
    expect(blocked.headers.get("location")).toBe("https://memoir.example/unlock?next=%2Ftopics");
    expect(blocked.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const token = await signAccessToken("secret");
    const allowed = await proxy(
      new NextRequest("https://memoir.example/topics", { headers: { cookie: `${ACCESS_COOKIE}=${token}` } }),
    );
    expect(allowed.headers.get("location")).toBeNull();

    const unlock = await proxy(new NextRequest("https://memoir.example/api/unlock"));
    expect(unlock.headers.get("location")).toBeNull();

    if (previous === undefined) delete process.env.ACCESS_PASSWORD;
    else process.env.ACCESS_PASSWORD = previous;
  });
});

describe("live models on Vercel", () => {
  it("uses OIDC when AI_MODE is live and no gateway key is set", () => {
    const previous = {
      mode: process.env.AI_MODE,
      key: process.env.AI_GATEWAY_API_KEY,
      oidc: process.env.VERCEL_OIDC_TOKEN,
      vercel: process.env.VERCEL,
    };
    process.env.AI_MODE = "live";
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VERCEL;
    expect(resolveAiMode()).toBe("mock");
    process.env.VERCEL = "1";
    expect(gatewayCredentialsPresent()).toBe(true);
    expect(resolveAiMode()).toBe("live");
    delete process.env.VERCEL;
    process.env.VERCEL_OIDC_TOKEN = "token";
    expect(resolveAiMode()).toBe("live");
    process.env.AI_MODE = "mock";
    expect(resolveAiMode()).toBe("mock");
    restore("AI_MODE", previous.mode);
    restore("AI_GATEWAY_API_KEY", previous.key);
    restore("VERCEL_OIDC_TOKEN", previous.oidc);
    restore("VERCEL", previous.vercel);
  });
});

describe("hosted schema file", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8");

  it("is idempotent and seeds every childhood topic", () => {
    expect(sql).toContain("create table if not exists public.users");
    expect(sql).toContain("create unique index if not exists");
    expect(sql).toContain("exception");
    expect(sql).toContain("on conflict (id) do nothing");
    expect(sql).toContain("on conflict (user_id, topic_id) do nothing");
    for (const topic of childhood.topics) {
      expect(sql).toContain(topic.id);
      expect(sql).toContain(topic.opening_question);
    }
    expect(childhood.topics).toHaveLength(12);
  });
});

function restore(name: "AI_MODE" | "AI_GATEWAY_API_KEY" | "VERCEL_OIDC_TOKEN" | "VERCEL", value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
