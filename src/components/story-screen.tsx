"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { IconArrow, IconBack } from "@/components/icons";
import { dictionaries, type Locale } from "@/i18n/dictionaries";
import type { Message } from "@/lib/types";

interface TopicChoice {
  id: string;
  label: string;
}

export function StoryScreen({
  locale,
  sessionId,
  topicId,
  topicLabel,
  messages,
  otherTopics,
}: {
  locale: Locale;
  sessionId: string;
  topicId: string | null;
  topicLabel: string;
  messages: Message[];
  otherTopics: TopicChoice[];
}) {
  const t = dictionaries[locale];
  const knownIds = messages.map((message) => message.id);
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const serverPending =
    lastUser && !messages.some((message) => message.inReplyTo === lastUser.id)
      ? { messageId: lastUser.id, content: lastUser.content }
      : null;
  const storedDraft = useSyncExternalStore(
    (notify) => {
      const handler = () => notify();
      window.addEventListener("eld-draft", handler);
      return () => window.removeEventListener("eld-draft", handler);
    },
    () => readDraft(sessionId, knownIds),
    () => "",
  );
  const [items, setItems] = useState(messages);
  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const draft = draftOverride ?? storedDraft;
  const [phase, setPhase] = useState<"idle" | "waiting" | "thinking" | "retry" | "streaming">(
    serverPending ? "retry" : "idle",
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(serverPending));
  const [showEarlier, setShowEarlier] = useState(false);
  const pendingRef = useRef(serverPending);

  function updateDraft(value: string) {
    setDraftOverride(value);
    localStorage.setItem(draftKey(sessionId), value);
    window.dispatchEvent(new Event("eld-draft"));
  }

  async function send(existing?: { messageId: string; content: string }) {
    const content = existing?.content ?? draft.trim();
    if (!content) return;
    const messageId = existing?.messageId ?? crypto.randomUUID();
    pendingRef.current = { messageId, content };
    localStorage.setItem(pendingKey(sessionId), JSON.stringify(pendingRef.current));
    setPhase("waiting");
    setError("");
    setSaved(Boolean(existing));
    const controller = new AbortController();
    let gotToken = false;
    let userSaved = Boolean(existing);
    const thinkingTimer = window.setTimeout(() => {
      setPhase((current) => (current === "waiting" ? "thinking" : current));
    }, 5000);
    const retryTimer = window.setTimeout(() => {
      controller.abort();
      setPhase("retry");
    }, 20000);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, content }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("send failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim()) as {
            type: string;
            message?: Message;
            text?: string;
          };
          if (event.type === "user_saved" && event.message) {
            userSaved = true;
            setSaved(true);
            setItems((current) => (current.some((item) => item.id === event.message?.id) ? current : [...current, event.message as Message]));
            if (draft.trim() === content) {
              setDraftOverride("");
              localStorage.removeItem(draftKey(sessionId));
              window.dispatchEvent(new Event("eld-draft"));
            }
          }
          if (event.type === "token" && event.text) {
            if (!gotToken) {
              gotToken = true;
              window.clearTimeout(thinkingTimer);
              window.clearTimeout(retryTimer);
              setPhase("streaming");
            }
            assistant += event.text;
            const partial = assistant;
            setItems((current) => upsertAssistant(current, messageId, partial));
          }
          if (event.type === "done" && event.message) {
            setItems((current) => upsertAssistant(current, messageId, event.message?.content ?? assistant, event.message));
            localStorage.removeItem(pendingKey(sessionId));
            pendingRef.current = null;
            setPhase("idle");
          }
          if (event.type === "error") throw new Error("turn failed");
        }
      }
      setPhase((current) => (current === "retry" ? current : "idle"));
    } catch {
      if (controller.signal.aborted) {
        setPhase("retry");
        setSaved(userSaved);
      } else {
        setError(t.sendFailed);
        setPhase(userSaved ? "retry" : "idle");
        setSaved(userSaved);
      }
    } finally {
      window.clearTimeout(thinkingTimer);
      window.clearTimeout(retryTimer);
    }
  }

  const lastAssistantIndex = items.findLastIndex((message) => message.role === "assistant");
  const current = lastAssistantIndex >= 0 ? items[lastAssistantIndex] : undefined;
  const history = items.filter((_, index) => index !== lastAssistantIndex);
  const collapsed = !showEarlier;
  const visibleHistory = collapsed ? history.slice(-2) : history;
  const busy = phase === "waiting" || phase === "thinking" || phase === "streaming" || phase === "retry";

  return (
    <main className="shell story">
      <div className="story-nav">
        <Link className="text-btn" href="/">
          <IconBack width={24} height={24} /> {t.home}
        </Link>
        <details>
          <summary className="text-btn">{t.changeTopic}</summary>
          <div className="sheet">
            {otherTopics.map((topic) => (
              <form key={topic.id} action="/api/sessions/start" method="post">
                <input type="hidden" name="entryMode" value="topic" />
                <input type="hidden" name="topicId" value={topic.id} />
                <button className="text-btn" type="submit">
                  {topic.label} <IconArrow width={18} height={18} />
                </button>
              </form>
            ))}
            {topicId ? (
              <form action="/api/topics/status" method="post">
                <input type="hidden" name="topicId" value={topicId} />
                <input type="hidden" name="status" value="not_now" />
                <input type="hidden" name="next" value="/" />
                <button className="text-btn" type="submit">{t.skipTopic}</button>
              </form>
            ) : null}
          </div>
        </details>
      </div>
      <div className="topic-head">
        <div className="topic-titles">
          <div className="overline">{t.growingUp}</div>
          <h1>{topicLabel}</h1>
        </div>
        <form action={`/api/sessions/${sessionId}/end`} method="post">
          <button className="btn secondary done-btn" type="submit">{t.doneToday}</button>
        </form>
      </div>
      <div className="divider" />
      <div className="history">
        {history.length > 2 ? (
          <button className="text-btn" type="button" onClick={() => setShowEarlier((value) => !value)}>
            {showEarlier ? t.hideEarlier : t.showEarlier}
          </button>
        ) : null}
        {visibleHistory.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="bubble history-item">{message.content}</div>
          ) : (
            <p key={message.id} className="history-item" style={{ color: "var(--color-textSecondary)" }}>{message.content}</p>
          ),
        )}
      </div>
      <div className="question" aria-live="polite">
        {phase === "thinking" ? <p className="thinking">{t.thinking}</p> : null}
        {phase === "retry" ? (
          <div className="retry">
            <p>{saved ? t.answerSaved : t.sendFailed}</p>
            <button className="btn primary" type="button" onClick={() => pendingRef.current && void send(pendingRef.current)}>
              {t.tryAgain}
            </button>
          </div>
        ) : (
          current?.content
        )}
      </div>
      <form
        className="dock"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void send();
        }}
      >
        <div className={error ? "composer error" : "composer"}>
          <label className="sr-only" htmlFor="answer">{t.placeholder}</label>
          <textarea
            id="answer"
            value={draft}
            placeholder={t.placeholder}
            onChange={(event) => updateDraft(event.target.value)}
          />
          {error ? <p className="caption" style={{ color: "var(--color-error)" }}>{error}</p> : null}
        </div>
        <div className="dock-row">
          <span className="caption">{t.savedAsYouGo}</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="mic-slot" aria-hidden="true" />
            <button className="btn primary" type="submit" disabled={busy || draft.trim().length === 0}>
              {t.send}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

function upsertAssistant(items: Message[], inReplyTo: string, content: string, finalMessage?: Message): Message[] {
  const index = items.findIndex((item) => item.inReplyTo === inReplyTo);
  const next = finalMessage ?? {
    id: `pending-${inReplyTo}`,
    sessionId: items[0]?.sessionId ?? "",
    userId: items[0]?.userId ?? "",
    role: "assistant" as const,
    kind: "follow_up" as const,
    content,
    locale: "en",
    inReplyTo,
    createdAt: new Date().toISOString(),
  };
  if (index === -1) return [...items, { ...next, content }];
  const copy = items.slice();
  copy[index] = { ...next, content };
  return copy;
}

function readDraft(sessionId: string, knownIds: string[]): string {
  const pendingRaw = localStorage.getItem(pendingKey(sessionId));
  if (pendingRaw) {
    const pending = JSON.parse(pendingRaw) as { messageId: string; content: string };
    if (!knownIds.includes(pending.messageId)) return pending.content;
  }
  return localStorage.getItem(draftKey(sessionId)) ?? "";
}

function draftKey(sessionId: string): string {
  return `eld.draft.v1.${sessionId}`;
}

function pendingKey(sessionId: string): string {
  return `eld.pending.v1.${sessionId}`;
}
