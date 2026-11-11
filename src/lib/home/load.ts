import { ensureSeeded } from "@/lib/catalog-sync";
import { RICKY_ID } from "@/lib/constants";
import { getSql } from "@/lib/db";
import { layoutHomeTopics } from "@/lib/home/recommend";
import { truncateWords } from "@/lib/text";
import type { Locale, TopicWithStatus } from "@/lib/types";

export interface ContinueCard {
  sessionId: string;
  topicId: string | null;
  title: string;
  blurb: string;
}

export interface HomeData {
  locale: Locale;
  name: string;
  storyCount: number;
  firstVisit: boolean;
  continueCard: ContinueCard | null;
  hero: TopicWithStatus | null;
  cards: TopicWithStatus[];
  allTopics: TopicWithStatus[];
}

export async function loadHome(): Promise<HomeData> {
  await ensureSeeded();
  const sql = getSql();
  const [userRows, topicRows, sessionRows, storyRows, messageRows] = await Promise.all([
    sql<{ display_name: string; ui_locale: string }[]>`
      select display_name, ui_locale from users where id = ${RICKY_ID}
    `,
    sql<TopicRow[]>`
      select t.id, t.title, t.opening_question, t.sensitive, t.recommend_by_default, t.recommend_rank, s.status
      from topics t
      join topic_states s on s.topic_id = t.id and s.user_id = ${RICKY_ID}
      order by t.recommend_rank nulls last, t.id
    `,
    sql<{ id: string; topic_id: string | null; title: unknown; last_user: string | null; opening: string | null }[]>`
      select s.id, s.topic_id, t.title,
        (select content from messages m where m.session_id = s.id and m.role = 'user' order by created_at desc limit 1) as last_user,
        (select content from messages m where m.session_id = s.id and m.role = 'assistant' order by created_at asc limit 1) as opening
      from sessions s
      left join topics t on t.id = s.topic_id
      where s.user_id = ${RICKY_ID} and s.status = 'open'
      order by s.last_activity_at desc
      limit 1
    `,
    sql<{ count: number }[]>`
      select count(*)::int as count from stories
      where user_id = ${RICKY_ID} and chapter_id = 'childhood' and status <> 'removed'
    `,
    sql<{ exists: boolean }[]>`
      select exists(select 1 from messages where user_id = ${RICKY_ID} and role = 'user') as exists
    `,
  ]);
  const user = userRows[0];
  const topics: TopicWithStatus[] = topicRows.map((row) => ({
    id: row.id,
    chapterId: "childhood",
    title: row.title,
    openingQuestion: row.opening_question,
    followUps: [],
    sensitive: row.sensitive,
    recommendByDefault: row.recommend_by_default,
    recommendRank: row.recommend_rank,
    status: row.status,
  }));
  const open = sessionRows[0];
  const layout = layoutHomeTopics(topics, open?.topic_id ?? null);
  const blurbSource = open?.last_user || open?.opening || "";
  return {
    locale: user?.ui_locale === "zh" ? "zh" : "en",
    name: user?.display_name ?? "Ricky",
    storyCount: storyRows[0]?.count ?? 0,
    firstVisit: messageRows[0]?.exists !== true && !open,
    continueCard: open
      ? {
          sessionId: open.id,
          topicId: open.topic_id,
          title: titleEn(open.title) || "Something else",
          blurb: truncateWords(blurbSource, 80),
        }
      : null,
    hero: layout.hero,
    cards: layout.cards,
    allTopics: topics,
  };
}

interface TopicRow {
  id: string;
  title: { en: string; zh: string };
  opening_question: string;
  sensitive: boolean;
  recommend_by_default: boolean;
  recommend_rank: number | null;
  status: TopicWithStatus["status"];
}

function titleEn(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return String((value as { en?: string }).en ?? "");
}
