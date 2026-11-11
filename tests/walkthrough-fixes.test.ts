import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { echoDetail, mockInterview } from "@/lib/ai/mock";
import { resolveRedirectLocation } from "@/lib/http";
import { loadLocalEnv, parseEnv } from "@/lib/load-env";
import { truncateWords } from "@/lib/text";
import { countQuestions } from "@/lib/conversation/guard";

describe("redirects behind a tunnel", () => {
  it("uses x-forwarded-host and x-forwarded-proto", () => {
    const request = new Request("http://localhost:3000/api/sessions/start", {
      headers: {
        "x-forwarded-host": "ricky.trycloudflare.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolveRedirectLocation(request, "/story/abc")).toBe(
      "https://ricky.trycloudflare.com/story/abc",
    );
  });

  it("stays relative when the proxy only rewrote the scheme onto localhost", () => {
    const request = new Request("http://localhost:3000/api/topics/status", {
      headers: {
        host: "localhost:3000",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolveRedirectLocation(request, "/")).toBe("/");
  });

  it("keeps a direct local request on localhost", () => {
    const request = new Request("http://localhost:3000/api/locale", {
      headers: { host: "localhost:3000" },
    });
    expect(resolveRedirectLocation(request, "/")).toBe("http://localhost:3000/");
  });

  it("uses the first forwarded host when several are listed", () => {
    const request = new Request("http://127.0.0.1:3000/api/sessions/abc/end", {
      headers: {
        "x-forwarded-host": "phone.example, localhost:3000",
        "x-forwarded-proto": "https, http",
      },
    });
    expect(resolveRedirectLocation(request, "/review/abc")).toBe("https://phone.example/review/abc");
  });
});

describe("continue blurb", () => {
  it("cuts on a word boundary and adds an ellipsis", () => {
    const source = "Tell me about the house you grew up in. What did you see when you walked in the front door?";
    const blurb = truncateWords(source, 80);
    expect(blurb.endsWith("…")).toBe(true);
    expect(blurb.endsWith("doo…")).toBe(false);
    expect(blurb.endsWith("wh…")).toBe(false);
    expect(blurb.length).toBeLessThanOrEqual(81);
    const withoutMark = blurb.slice(0, -1);
    expect(source.startsWith(withoutMark)).toBe(true);
    expect(source[withoutMark.length]).toBe(" ");
  });

  it("leaves a short line unchanged", () => {
    expect(truncateWords("yellow kitchen", 80)).toBe("yellow kitchen");
  });
});

describe("mock interviewer", () => {
  it("does not echo a phrase that stops on a dangling article", () => {
    const reply = mockInterview(
      [
        "Follow-ups used: 0",
        "Answer length: short",
        "Suggested follow-ups: Where did you sleep? Did you share a room?",
        "Them: it was a white house on elm street",
      ].join("\n"),
    );
    expect(reply.startsWith("It was a white.")).toBe(false);
    expect(reply).toContain("It was a white house");
    expect(countQuestions(reply)).toBe(1);
    expect(echoDetail("yellow kitchen. mom had the radio on")).toBe("Yellow kitchen.");
  });
});

describe("script env files", () => {
  it("loads .env.local without overriding an existing variable", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eld-env-"));
    fs.writeFileSync(path.join(dir, ".env"), "DATABASE_URL=from-env\nAI_MODE=live\n");
    fs.writeFileSync(path.join(dir, ".env.local"), "DATABASE_URL=from-local\n# comment\nEMPTY=\n");
    const previousDb = process.env.DATABASE_URL;
    const previousMode = process.env.AI_MODE;
    delete process.env.DATABASE_URL;
    delete process.env.AI_MODE;
    try {
      loadLocalEnv(dir);
      expect(process.env.DATABASE_URL).toBe("from-local");
      expect(process.env.AI_MODE).toBe("live");
      process.env.DATABASE_URL = "from-shell";
      loadLocalEnv(dir);
      expect(process.env.DATABASE_URL).toBe("from-shell");
    } finally {
      if (previousDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDb;
      if (previousMode === undefined) delete process.env.AI_MODE;
      else process.env.AI_MODE = previousMode;
    }
  });

  it("parses quoted values", () => {
    expect(parseEnv('DATABASE_URL="postgres://eld:eld@127.0.0.1:5432/eld"\n')).toEqual([
      ["DATABASE_URL", "postgres://eld:eld@127.0.0.1:5432/eld"],
    ]);
  });
});
