import { Greeting } from "@/components/greeting";
import { IconArrow, IconBook, IconChat, IconMore } from "@/components/icons";
import { dictionaries } from "@/i18n/dictionaries";
import { loadHome } from "@/lib/home/load";
import type { TopicWithStatus } from "@/lib/types";

export default async function HomePage() {
  const home = await loadHome();
  const t = dictionaries[home.locale];
  const title = (topic: TopicWithStatus) => (home.locale === "zh" ? topic.title.zh : topic.title.en);
  return (
    <main className="shell home" lang={home.locale === "zh" ? "zh-Hans" : "en"}>
      <div className="nav">
        <div className="brand">
          <IconBook width={26} height={26} />
          <span>{t.memoir}</span>
        </div>
        <form className="seg" action="/api/locale" method="post">
          <button type="submit" name="locale" value="en" aria-pressed={home.locale === "en"}>
            {t.languageEn}
          </button>
          <button type="submit" name="locale" value="zh" aria-pressed={home.locale === "zh"}>
            {t.languageZh}
          </button>
        </form>
      </div>
      <Greeting locale={home.locale} name={home.name} firstVisit={home.firstVisit} />
      <p className="sub">{home.firstVisit ? t.welcomeBody : t.progress(home.storyCount)}</p>

      {home.continueCard ? (
        <section className="hero">
          <div className="kicker">{t.continueKicker}</div>
          <h2>{home.continueCard.title}</h2>
          {home.continueCard.blurb ? <p>{t.lastTime(home.continueCard.blurb)}</p> : null}
          <a className="btn on-hero" href={`/story/${home.continueCard.sessionId}`}>
            {t.continue} <IconArrow width={20} height={20} />
          </a>
        </section>
      ) : null}

      {home.hero ? <TopicHero topic={home.hero} label={title(home.hero)} start={t.start} /> : null}

      <div className="section-row">
        <div className="overline">{t.orTry}</div>
      </div>
      {home.cards.length === 0 && !home.hero && !home.continueCard ? <p>{t.allDone}</p> : null}
      {home.cards.map((topic) => (
        <TopicCard key={topic.id} topic={topic} label={title(topic)} t={t} />
      ))}

      <details className="sheet">
        <summary className="text-btn">{t.seeAll}</summary>
        {home.allTopics.map((topic) => (
          <TopicCard key={`all-${topic.id}`} topic={topic} label={title(topic)} t={t} showStatus />
        ))}
      </details>

      <form action="/api/sessions/start" method="post">
        <input type="hidden" name="entryMode" value="free" />
        <button className="card free" type="submit">
          <IconChat width={24} height={24} />
          <span style={{ flex: 1 }}>{t.freeTalk}</span>
        </button>
      </form>

      <div className="memoir-bar">
        <a className="btn secondary" href="/book">
          <IconBook width={22} height={22} /> {t.myMemoir}
        </a>
      </div>
    </main>
  );
}

function TopicHero({ topic, label, start }: { topic: TopicWithStatus; label: string; start: string }) {
  return (
    <section className="hero">
      <h2>{label}</h2>
      <p>{topic.openingQuestion}</p>
      <form action="/api/sessions/start" method="post">
        <input type="hidden" name="entryMode" value="topic" />
        <input type="hidden" name="topicId" value={topic.id} />
        <button className="btn on-hero" type="submit">
          {start}
        </button>
      </form>
    </section>
  );
}

function TopicCard({
  topic,
  label,
  t,
  showStatus = false,
}: {
  topic: TopicWithStatus;
  label: string;
  t: (typeof dictionaries)["en"];
  showStatus?: boolean;
}) {
  return (
    <article className="card">
      <div className="card-top">
        <div>
          <h3>{label}</h3>
          <p className="hint">{topic.sensitive ? t.sensitive : topic.openingQuestion}</p>
        </div>
        <details className="menu">
          <summary className="icon-btn" aria-label={t.dontAsk}>
            <IconMore width={24} height={24} />
          </summary>
          <div className="menu-panel">
            {topic.status === "do_not_write" ? (
              <form action="/api/topics/status" method="post">
                <input type="hidden" name="topicId" value={topic.id} />
                <input type="hidden" name="status" value="recommendable" />
                <button className="text-btn" type="submit">{t.askAgain}</button>
              </form>
            ) : (
              <form action="/api/topics/status" method="post">
                <input type="hidden" name="topicId" value={topic.id} />
                <input type="hidden" name="status" value="do_not_write" />
                <button className="text-btn" type="submit">{t.dontAskConfirm}</button>
              </form>
            )}
          </div>
        </details>
      </div>
      <div className="card-actions">
        {topic.status === "do_not_write" ? (
          <span className="caption">{showStatus ? t.dontAsk : ""}</span>
        ) : (
          <form action="/api/topics/status" method="post">
            <input type="hidden" name="topicId" value={topic.id} />
            <input type="hidden" name="status" value="not_now" />
            <button className="text-btn" type="submit" style={{ color: "var(--color-textSecondary)", fontWeight: 400 }}>
              {t.notNow}
            </button>
          </form>
        )}
        {topic.status === "do_not_write" ? null : (
          <form action="/api/sessions/start" method="post">
            <input type="hidden" name="entryMode" value="topic" />
            <input type="hidden" name="topicId" value={topic.id} />
            <button className="text-btn" type="submit">
              {t.start} <IconArrow width={20} height={20} />
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
