import { notFound } from "next/navigation";
import { StoryScreen } from "@/components/story-screen";
import { ensureSeeded } from "@/lib/catalog-sync";
import { RICKY_ID } from "@/lib/constants";
import { getSql } from "@/lib/db";
import { recommendableTopics } from "@/lib/home/recommend";
import { PostgresRepo } from "@/lib/repo/postgres";
import type { TopicWithStatus } from "@/lib/types";

export default async function StoryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  await ensureSeeded();
  const repo = new PostgresRepo();
  const session = await repo.getSession(sessionId);
  if (!session || session.userId !== RICKY_ID) notFound();
  const messages = await repo.listMessages(sessionId);
  const sql = getSql();
  const [userRows, topicRows] = await Promise.all([
    sql<{ ui_locale: string }[]>`select ui_locale from users where id = ${RICKY_ID}`,
    sql<{ id: string; title: { en: string; zh: string }; opening_question: string; sensitive: boolean; recommend_by_default: boolean; recommend_rank: number | null; status: TopicWithStatus["status"] }[]>`
      select t.id, t.title, t.opening_question, t.sensitive, t.recommend_by_default, t.recommend_rank, s.status
      from topics t
      join topic_states s on s.topic_id = t.id and s.user_id = ${RICKY_ID}
    `,
  ]);
  const locale = userRows[0]?.ui_locale === "zh" ? "zh" : "en";
  const topics: TopicWithStatus[] = topicRows.map((row) => ({
    id: row.id,
    chapterId: "childhood",
    title: row.title,
    openingQuestion: row.opening_question,
    cardHint: "",
    followUps: [],
    sensitive: row.sensitive,
    recommendByDefault: row.recommend_by_default,
    recommendRank: row.recommend_rank,
    status: row.status,
  }));
  const current = topics.find((topic) => topic.id === session.topicId);
  const label = session.topicId
    ? locale === "zh"
      ? current?.title.zh
      : current?.title.en
    : locale === "zh"
      ? "想讲点别的"
      : "Something else";
  const otherTopics = recommendableTopics(topics)
    .filter((topic) => topic.id !== session.topicId)
    .slice(0, 3)
    .map((topic) => ({ id: topic.id, label: locale === "zh" ? topic.title.zh : topic.title.en }));
  return (
    <StoryScreen
      locale={locale}
      sessionId={session.id}
      topicId={session.topicId}
      topicLabel={label || "Story"}
      messages={messages}
      otherTopics={otherTopics}
    />
  );
}
