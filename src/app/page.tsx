import Link from "next/link";
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
      {home.firstVisit ? (
        <div className="welcome">
          <h1 className="display">{t.welcomeTitle(home.name)}</h1>
          <p className="body-text">{t.welcomeRest}</p>
        </div>
      ) : (
        <>
          <Greeting locale={home.locale} name={home.name} firstVisit={false} />
          {home.storyCount > 0 ? <p className="sub">{t.progress(home.storyCount)}</p> : null}
        </>
      )}

      {home.continueCard ? (
        <section className="hero">
          <div className="kicker">{t.continueKicker}</div>
          <h2>{home.continueCard.title}</h2>
          {home.continueCard.blurb ? <p className="last-time">{t.lastTime(home.continueCard.blurb)}</p> : null}
          <a className="btn on-hero" href={`/story/${home.continueCard.sessionId}`}>
            {t.continue} <IconArrow width={20} height={20} />
          </a>
        </section>
      ) : null}

      {home.hero ? (
        <TopicHero
          topic={home.hero}
          label={title(home.hero)}
          hint={home.hero.cardHint}
          start={t.start}
          kicker={home.firstVisit ? t.startHere : null}
        />
      ) : null}

      <div className="section-row">
        <div className="overline">{t.orTry}</div>
        <Link className="see-all-btn" href="/topics">{t.seeAll}</Link>
      </div>
      {home.cards.length === 0 && !home.hero && !home.continueCard ? <p>{t.allDone}</p> : null}
      {home.cards.map((topic) => (
        <TopicCard key={topic.id} topic={topic} label={title(topic)} hint={topic.cardHint} t={t} />
      ))}

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

function TopicHero({
  topic,
  label,
  hint,
  start,
  kicker,
}: {
  topic: TopicWithStatus;
  label: string;
  hint: string;
  start: string;
  kicker: string | null;
}) {
  return (
    <section className="hero">
      {kicker ? <div className="kicker">{kicker}</div> : null}
      <h2>{label}</h2>
      <p className="hint on-hero">{hint}</p>
      <form action="/api/sessions/start" method="post">
        <input type="hidden" name="entryMode" value="topic" />
        <input type="hidden" name="topicId" value={topic.id} />
        <button className="btn on-hero" type="submit">
          {start} <IconArrow width={20} height={20} />
        </button>
      </form>
    </section>
  );
}

function TopicCard({
  topic,
  label,
  hint,
  t,
  inDirectory = false,
}: {
  topic: TopicWithStatus;
  label: string;
  hint: string;
  t: (typeof dictionaries)["en"];
  inDirectory?: boolean;
}) {
  return (
    <article className="card">
      <div className="card-top">
        <div>
          <h3>{label}</h3>
          <p className="hint">{hint}</p>
          {inDirectory && topic.status === "do_not_write" ? <p className="mark">{t.wontAsk}</p> : null}
          {inDirectory && topic.status === "not_now" ? <p className="mark">{t.notNow}</p> : null}
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
          <form action="/api/topics/status" method="post">
            <input type="hidden" name="topicId" value={topic.id} />
            <input type="hidden" name="status" value="recommendable" />
            <button className="text-btn" type="submit">{t.askAgain}</button>
          </form>
        ) : topic.status === "not_now" ? (
          <span />
        ) : (
          <form action="/api/topics/status" method="post">
            <input type="hidden" name="topicId" value={topic.id} />
            <input type="hidden" name="status" value="not_now" />
            <button className="text-btn" type="submit" style={{ color: "var(--color-textSecondary)", fontWeight: 400 }}>
              {t.notNow}
            </button>
          </form>
        )}
        <form action="/api/sessions/start" method="post">
          <input type="hidden" name="entryMode" value="topic" />
          <input type="hidden" name="topicId" value={topic.id} />
          <button className="text-btn" type="submit">
            {t.start} <IconArrow width={20} height={20} />
          </button>
        </form>
      </div>
    </article>
  );
}
