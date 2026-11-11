import { catalogRevision, childhoodConfigVersion, loadChapters, loadChildhoodTopics } from "@/lib/config/catalog";
import { RICKY_ID, RICKY_NAME } from "@/lib/constants";
import { getSql } from "@/lib/db";

let syncedRevision = "";
let inflight: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  const revision = catalogRevision();
  if (revision === syncedRevision) return Promise.resolve();
  if (!inflight) {
    inflight = syncCatalog()
      .then(() => {
        syncedRevision = revision;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

async function syncCatalog(): Promise<void> {
  const sql = getSql();
  const chapters = loadChapters();
  const topics = loadChildhoodTopics();
  const version = childhoodConfigVersion();
  await sql`
    insert into users (id, display_name, ui_locale, narration_locale, book_title)
    values (${RICKY_ID}, ${RICKY_NAME}, 'en', 'en', ${`${RICKY_NAME}'s story`})
    on conflict (id) do nothing
  `;
  for (const chapter of chapters) {
    await sql`
      insert into chapters (id, title, optional, sort_order)
      values (${chapter.id}, ${sql.json(chapter.title)}, ${chapter.optional}, ${chapter.sortOrder})
      on conflict (id) do update
        set title = excluded.title, optional = excluded.optional, sort_order = excluded.sort_order
    `;
  }
  for (const topic of topics) {
    await sql`
      insert into topics (
        id, chapter_id, config_version, title, opening_question, follow_ups,
        sensitive, recommend_by_default, recommend_rank
      ) values (
        ${topic.id}, ${topic.chapterId}, ${version}, ${sql.json(topic.title)},
        ${topic.openingQuestion}, ${sql.json(topic.followUps)},
        ${topic.sensitive}, ${topic.recommendByDefault}, ${topic.recommendRank}
      )
      on conflict (id) do update set
        chapter_id = excluded.chapter_id,
        config_version = excluded.config_version,
        title = excluded.title,
        opening_question = excluded.opening_question,
        follow_ups = excluded.follow_ups,
        sensitive = excluded.sensitive,
        recommend_by_default = excluded.recommend_by_default,
        recommend_rank = excluded.recommend_rank
    `;
    await sql`
      insert into topic_states (user_id, topic_id)
      values (${RICKY_ID}, ${topic.id})
      on conflict (user_id, topic_id) do nothing
    `;
  }
}
