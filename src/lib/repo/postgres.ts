import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { IdempotencyConflict, type CommitTurnInput, type ConversationRepo, type MemoryBundle } from "@/lib/repo/types";
import type {
  Classification,
  EntryMode,
  Message,
  MessageKind,
  ModelCallRecord,
  Session,
  SessionStatus,
  TopicContent,
  TopicStatus,
} from "@/lib/types";

type Sql = ReturnType<typeof getSql>;
type Row = Record<string, unknown>;

export class PostgresRepo implements ConversationRepo {
  constructor(private readonly sql: Sql = getSql()) {}

  async createSession(input: {
    userId: string;
    topicId: string | null;
    entryMode: EntryMode;
    opening: { content: string; kind: MessageKind };
  }): Promise<{ session: Session; messages: Message[] }> {
    const sessionId = randomUUID();
    const openingId = randomUUID();
    const rows = await this.sql.begin(async (tx) => {
      const sessionRows = await tx<Row[]>`
        insert into sessions (id, user_id, topic_id, entry_mode)
        values (${sessionId}, ${input.userId}, ${input.topicId}, ${input.entryMode}::entry_mode)
        returning *
      `;
      const messageRows = await tx<Row[]>`
        insert into messages (id, session_id, user_id, role, kind, content, locale)
        values (
          ${openingId}, ${sessionId}, ${input.userId}, 'assistant',
          ${input.opening.kind}::message_kind, ${input.opening.content}, 'en'
        )
        returning *
      `;
      return { session: sessionRows[0], message: messageRows[0] };
    });
    if (!rows.session || !rows.message) throw new Error("Could not open session");
    return { session: mapSession(rows.session), messages: [mapMessage(rows.message)] };
  }

  async getSession(id: string): Promise<Session | null> {
    const rows = await this.sql<Row[]>`select * from sessions where id = ${id}`;
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async listMessages(sessionId: string): Promise<Message[]> {
    const rows = await this.sql<Row[]>`
      select * from messages where session_id = ${sessionId} order by created_at, id
    `;
    return rows.map(mapMessage);
  }

  async insertUserMessage(input: {
    id: string;
    sessionId: string;
    userId: string;
    content: string;
  }): Promise<{ message: Message; inserted: boolean }> {
    const inserted = await this.sql<Row[]>`
      insert into messages (id, session_id, user_id, role, kind, content, locale)
      values (${input.id}, ${input.sessionId}, ${input.userId}, 'user', 'user_turn', ${input.content}, 'en')
      on conflict (id) do nothing
      returning *
    `;
    if (inserted[0]) {
      await this.sql`update sessions set last_activity_at = now() where id = ${input.sessionId}`;
      return { message: mapMessage(inserted[0]), inserted: true };
    }
    const existing = await this.sql<Row[]>`select * from messages where id = ${input.id}`;
    const row = existing[0];
    if (!row) throw new Error("Message insert failed");
    if (row.content !== input.content || row.session_id !== input.sessionId) throw new IdempotencyConflict();
    return { message: mapMessage(row), inserted: false };
  }

  async findAssistantReply(userMessageId: string): Promise<Message | null> {
    const rows = await this.sql<Row[]>`
      select * from messages where role = 'assistant' and in_reply_to = ${userMessageId} limit 1
    `;
    return rows[0] ? mapMessage(rows[0]) : null;
  }

  async getClassification(messageId: string): Promise<Classification | null> {
    const rows = await this.sql<Row[]>`select * from turn_classifications where message_id = ${messageId}`;
    return rows[0] ? mapClassification(rows[0]) : null;
  }

  async saveClassification(messageId: string, classification: Classification, modelCallId: string | null): Promise<void> {
    await this.sql`
      insert into turn_classifications (
        message_id, refusal, refusal_scope, refused_point, off_topic_chapter,
        wants_to_stop, distress, answer_length, do_not_write, do_not_write_scope, model_call_id
      ) values (
        ${messageId}, ${classification.refusal}, ${classification.refusalScope}, ${classification.refusedPoint},
        ${classification.offTopicChapter}, ${classification.wantsToStop}, ${classification.distress},
        ${classification.answerLength}, ${classification.doNotWrite}, ${classification.doNotWriteScope}, ${modelCallId}
      )
      on conflict (message_id) do nothing
    `;
  }

  async listClassifications(sessionId: string): Promise<{ messageId: string; classification: Classification }[]> {
    const rows = await this.sql<Row[]>`
      select c.* from turn_classifications c
      join messages m on m.id = c.message_id
      where m.session_id = ${sessionId}
      order by m.created_at, m.id
    `;
    return rows.map((row) => ({ messageId: String(row.message_id), classification: mapClassification(row) }));
  }

  async commitAssistantTurn(input: CommitTurnInput): Promise<{ message: Message; session: Session; inserted: boolean }> {
    const messageId = randomUUID();
    return this.sql.begin(async (tx) => {
      const inserted = await tx<Row[]>`
        insert into messages (id, session_id, user_id, role, kind, content, locale, in_reply_to)
        values (
          ${messageId}, ${input.sessionId}, ${input.userId}, 'assistant',
          ${input.kind}::message_kind, ${input.content}, 'en', ${input.inReplyTo}
        )
        on conflict (in_reply_to) where role = 'assistant' and in_reply_to is not null
        do nothing
        returning *
      `;
      if (!inserted[0]) {
        const existing = await tx<Row[]>`
          select * from messages where role = 'assistant' and in_reply_to = ${input.inReplyTo} limit 1
        `;
        const sessionRows = await tx<Row[]>`select * from sessions where id = ${input.sessionId}`;
        if (!existing[0] || !sessionRows[0]) throw new Error("Reply conflict could not be reloaded");
        return { message: mapMessage(existing[0]), session: mapSession(sessionRows[0]), inserted: false };
      }
      const sessionRows = await tx<Row[]>`
        update sessions set
          followups_used = followups_used + ${input.countsAsFollowUp ? 1 : 0},
          extended_by_user = extended_by_user or ${input.setExtended},
          awaiting = case
            when ${input.clearAwaiting} then null
            when ${input.setAwaiting}::text is not null then ${input.setAwaiting}
            else awaiting
          end,
          status = case when ${input.endSession} then 'ended' else status end,
          ended_at = case when ${input.endSession} then now() else ended_at end,
          last_activity_at = now()
        where id = ${input.sessionId}
        returning *
      `;
      for (const point of input.points ?? []) {
        await tx`
          insert into refused_points (user_id, topic_id, point, message_id, kind)
          values (${point.userId}, ${point.topicId}, ${point.point}, ${point.messageId}, ${point.kind})
          on conflict (message_id, kind) do nothing
        `;
      }
      if (input.markTopicDoNotWrite) {
        await tx`
          insert into topic_states (user_id, topic_id, status)
          values (
            ${input.markTopicDoNotWrite.userId},
            ${input.markTopicDoNotWrite.topicId},
            'do_not_write'::topic_status
          )
          on conflict (user_id, topic_id) do update
            set status = 'do_not_write', updated_at = now()
        `;
      }
      if (!sessionRows[0]) throw new Error("Session update failed");
      return { message: mapMessage(inserted[0]), session: mapSession(sessionRows[0]), inserted: true };
    });
  }

  async getTopic(topicId: string): Promise<TopicContent | null> {
    const rows = await this.sql<Row[]>`select * from topics where id = ${topicId}`;
    return rows[0] ? mapTopic(rows[0]) : null;
  }

  async listDoNotWrite(userId: string): Promise<{ id: string; titleEn: string }[]> {
    const rows = await this.sql<Row[]>`
      select t.id, t.title from topics t
      join topic_states s on s.topic_id = t.id and s.user_id = ${userId}
      where s.status = 'do_not_write'
    `;
    return rows.map((row) => ({ id: String(row.id), titleEn: titleOf(row.title).en }));
  }

  async listRefusalPoints(userId: string, topicId: string | null): Promise<string[]> {
    const rows = await this.sql<Row[]>`
      select point from refused_points
      where user_id = ${userId}
        and kind = 'refusal'
        and (${topicId}::text is null or topic_id is null or topic_id = ${topicId})
    `;
    return rows.map((row) => String(row.point));
  }

  async getMemory(userId: string, topicId: string | null): Promise<MemoryBundle> {
    const [profile, people, summaries, gaps] = await Promise.all([
      this.sql<Row[]>`select key, value from memory_profile where user_id = ${userId} order by key`,
      this.sql<Row[]>`select name, relation from people where user_id = ${userId} order by name`,
      this.sql<Row[]>`
        select topic_id, summary from stories
        where user_id = ${userId} and summary is not null and status <> 'removed'
        order by created_at
      `,
      this.sql<Row[]>`
        select id, next_question from followup_gaps
        where user_id = ${userId} and asked_message_id is null
          and (${topicId}::text is null or topic_id = ${topicId})
        order by priority, created_at
        limit 1
      `,
    ]);
    return {
      profile: profile.map((row) => ({ key: String(row.key), value: String(row.value) })),
      people: people.map((row) => ({ name: String(row.name), relation: (row.relation as string | null) ?? null })),
      storySummaries: summaries.map((row) => ({
        topicId: (row.topic_id as string | null) ?? null,
        summary: String(row.summary),
      })),
      openingGap: gaps[0] ? { id: String(gaps[0].id), nextQuestion: String(gaps[0].next_question) } : null,
    };
  }

  async findLatestOpenSession(userId: string): Promise<Session | null> {
    const rows = await this.sql<Row[]>`
      select * from sessions
      where user_id = ${userId} and status = 'open'
      order by last_activity_at desc
      limit 1
    `;
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async findOpenSessionForTopic(userId: string, topicId: string): Promise<Session | null> {
    const rows = await this.sql<Row[]>`
      select * from sessions
      where user_id = ${userId} and topic_id = ${topicId} and status = 'open'
      order by last_activity_at desc
      limit 1
    `;
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async findOpenFreeSession(userId: string): Promise<Session | null> {
    const rows = await this.sql<Row[]>`
      select * from sessions
      where user_id = ${userId} and topic_id is null and entry_mode = 'free' and status = 'open'
      order by last_activity_at desc
      limit 1
    `;
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async endSession(id: string, status: Extract<SessionStatus, "ended" | "abandoned">): Promise<void> {
    await this.sql`
      update sessions set status = ${status}, ended_at = now(), last_activity_at = now()
      where id = ${id}
    `;
  }

  async setTopicStatus(userId: string, topicId: string, status: TopicStatus): Promise<void> {
    await this.sql`
      insert into topic_states (user_id, topic_id, status)
      values (${userId}, ${topicId}, ${status}::topic_status)
      on conflict (user_id, topic_id) do update set status = excluded.status, updated_at = now()
    `;
  }

  async logModelCall(call: ModelCallRecord & { userId?: string; sessionId?: string | null }): Promise<string> {
    const rows = await this.sql<Row[]>`
      insert into model_calls (
        user_id, session_id, step, provider, model, input_tokens, output_tokens,
        cost_usd, latency_ms, first_token_ms, ok, error
      ) values (
        ${call.userId ?? null}, ${call.sessionId ?? null}, ${call.step}, ${call.provider}, ${call.model},
        ${call.inputTokens}, ${call.outputTokens}, ${call.costUsd}, ${call.latencyMs}, ${call.firstTokenMs},
        ${call.ok}, ${call.error}
      )
      returning id
    `;
    return String(rows[0]?.id);
  }
}

function mapSession(row: Row): Session {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    topicId: (row.topic_id as string | null) ?? null,
    storyId: (row.story_id as string | null) ?? null,
    entryMode: row.entry_mode as Session["entryMode"],
    followupsUsed: Number(row.followups_used),
    extendedByUser: Boolean(row.extended_by_user),
    awaiting: (row.awaiting as Session["awaiting"]) ?? null,
    status: row.status as Session["status"],
    startedAt: iso(row.started_at),
    endedAt: row.ended_at ? iso(row.ended_at) : null,
    lastActivityAt: iso(row.last_activity_at),
  };
}

function mapMessage(row: Row): Message {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    role: row.role as Message["role"],
    kind: row.kind as Message["kind"],
    content: String(row.content),
    locale: String(row.locale),
    inReplyTo: (row.in_reply_to as string | null) ?? null,
    createdAt: iso(row.created_at),
  };
}

function mapClassification(row: Row): Classification {
  return {
    refusal: Boolean(row.refusal),
    refusalScope: row.refusal_scope as Classification["refusalScope"],
    refusedPoint: (row.refused_point as string | null) ?? null,
    offTopicChapter: (row.off_topic_chapter as string | null) ?? null,
    wantsToStop: Boolean(row.wants_to_stop),
    distress: row.distress as Classification["distress"],
    answerLength: row.answer_length as Classification["answerLength"],
    doNotWrite: Boolean(row.do_not_write),
    doNotWriteScope: row.do_not_write_scope as Classification["doNotWriteScope"],
  };
}

function mapTopic(row: Row): TopicContent {
  return {
    id: String(row.id),
    chapterId: String(row.chapter_id),
    title: titleOf(row.title),
    openingQuestion: String(row.opening_question),
    followUps: Array.isArray(row.follow_ups) ? (row.follow_ups as string[]) : [],
    sensitive: Boolean(row.sensitive),
    recommendByDefault: Boolean(row.recommend_by_default),
    recommendRank: row.recommend_rank == null ? null : Number(row.recommend_rank),
  };
}

function titleOf(value: unknown): { en: string; zh: string } {
  const title = value as { en?: string; zh?: string };
  return { en: title?.en ?? "", zh: title?.zh ?? "" };
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
