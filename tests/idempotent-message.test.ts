import { describe, expect, it } from "vitest";
import { loadChildhoodTopics } from "@/lib/config/catalog";
import { IdempotencyConflict } from "@/lib/repo/types";
import { MemoryRepo } from "@/lib/repo/memory";
import { MockModelClient } from "@/lib/ai/mock";
import { runTurn } from "@/lib/conversation/engine";
import { openConversation } from "@/lib/conversation/open";

const USER = "99999999-9999-4999-8999-999999999999";

describe("idempotent message insert", () => {
  it("replays the same id and rejects a different body", async () => {
    const repo = new MemoryRepo(loadChildhoodTopics());
    const opened = await openConversation(repo, { userId: USER, entryMode: "topic", topicId: "childhood-food" });
    const first = await repo.insertUserMessage({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      sessionId: opened.session.id,
      userId: USER,
      content: "biscuits most mornings",
    });
    const second = await repo.insertUserMessage({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      sessionId: opened.session.id,
      userId: USER,
      content: "biscuits most mornings",
    });
    expect(second.inserted).toBe(false);
    expect(second.message.id).toBe(first.message.id);
    expect(repo.messages.filter((message) => message.role === "user")).toHaveLength(1);
    await expect(
      repo.insertUserMessage({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        sessionId: opened.session.id,
        userId: USER,
        content: "something else",
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflict);
  });

  it("does not call the interviewer twice when the same message is retried", async () => {
    const repo = new MemoryRepo(loadChildhoodTopics());
    const ai = new MockModelClient();
    const opened = await openConversation(repo, { userId: USER, entryMode: "free" });
    const input = {
      sessionId: opened.session.id,
      userId: USER,
      messageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      content: "we had a yellow kitchen and mom baked on saturdays",
    };
    const first = await runTurn(repo, ai, input);
    const callsAfterFirst = repo.calls.length;
    const second = await runTurn(repo, ai, input);
    expect(second.replayed).toBe(true);
    expect(second.assistantMessage.id).toBe(first.assistantMessage.id);
    expect(repo.calls.length).toBe(callsAfterFirst);
  });
});
