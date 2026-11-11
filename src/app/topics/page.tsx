import Link from "next/link";
import { IconBack, IconChevron } from "@/components/icons";
import { dictionaries } from "@/i18n/dictionaries";
import { loadHome } from "@/lib/home/load";
import { partitionTopics } from "@/lib/home/recommend";
import type { TopicWithStatus } from "@/lib/types";

export default async function TopicsPage() {
  const home = await loadHome();
  const t = dictionaries[home.locale];
  const { listed, setAside } = partitionTopics(home.allTopics);
  const title = (topic: TopicWithStatus) => (home.locale === "zh" ? topic.title.zh : topic.title.en);
  return (
    <main className="shell home topics-page" lang={home.locale === "zh" ? "zh-Hans" : "en"}>
      <div className="nav">
        <Link className="text-btn" href="/">
          <IconBack width={24} height={24} /> {t.home}
        </Link>
      </div>
      <h1 className="display">{t.allTopicsTitle}</h1>
      <p className="sub">{t.allTopicsSub}</p>
      <div className="topic-list">
        {listed.map((topic) => (
          <form key={topic.id} action="/api/sessions/start" method="post">
            <input type="hidden" name="entryMode" value="topic" />
            <input type="hidden" name="topicId" value={topic.id} />
            <button className="topic-row" type="submit">
              <span className="topic-row-text">
                <span className="topic-row-title">{title(topic)}</span>
                <span className="hint">{topic.cardHint}</span>
                <TopicTag topic={topic} t={t} />
              </span>
              <span className="topic-chevron">
                <IconChevron width={20} height={20} />
              </span>
            </button>
          </form>
        ))}
      </div>
      {setAside.length > 0 ? (
        <>
          <div className="overline set-aside">{t.askedNotTo}</div>
          <div className="topic-list">
            {setAside.map((topic) => (
              <form key={topic.id} action="/api/topics/status" method="post">
                <input type="hidden" name="topicId" value={topic.id} />
                <input type="hidden" name="status" value="recommendable" />
                <input type="hidden" name="next" value="/topics" />
                <div className="bring-row">
                  <span>{title(topic)}</span>
                  <button className="text-btn" type="submit">{t.bringItBack}</button>
                </div>
              </form>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

function TopicTag({
  topic,
  t,
}: {
  topic: TopicWithStatus;
  t: (typeof dictionaries)["en"];
}) {
  const count = topic.storyCount ?? 0;
  if (count > 0) return <span className="tag stories">{t.storyTag(count)}</span>;
  if (topic.inProgress) return <span className="tag progress">{t.inProgress}</span>;
  return null;
}
