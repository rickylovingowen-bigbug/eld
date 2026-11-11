# Memoir Writing Spec v1 — Childhood (text beta)

Owner: 传记作者 (editorial). Consumers: ai (prompts + rubric), 开发 (pipeline).
All names, quotes, and stories below are EXAMPLE CONTENT, not real user data.

Core principle: **the writer arranges, it never invents.** Vivid detail comes from follow-up questions, not from the writing model. A gap becomes a question, not a sentence.

Source unit: one `message_id`. A source is the elder's message **plus the AI question it answers** (text answers are often "Yes, the red one").

---

## Step 1 — Extract (material table)

### Rules
1. Output one row per atomic item. Types: `fact` (who/where/when/what), `sensory` (smell, sound, color, texture, taste), `quote` (wording worth keeping verbatim), `meaning` (why this matters to them, in their words), `person`.
2. Every row has `source_ids` (message ids) and `provenance`:
   - `told` — the elder stated it.
   - `confirmed` — the AI suggested it and the elder only agreed ("yes", "that's right"). Use cautiously later.
   - `heard` — the elder says family told them ("Mom always said I…").
   - `unsure` — the elder hedges ("I think", "maybe '52"). Keep the hedge in the row.
3. Copy quotes exactly, including grammar, slang, and spelling the elder uses on purpose. Fix only obvious typos (`teh` → `the`).
4. `meaning` is only filled if the elder said it. Never infer it. Empty is fine.
5. Do not merge two people or two places unless the elder said they're the same.
6. Record contradictions as two rows plus a `conflict` flag; don't pick one.

### Examples
**Input** — AI: "What was the kitchen like?" Elder: "small. yellow walls. mom always had the radio on, ball games mostly"

Good:
- fact: kitchen was small — told — [m12]
- sensory: yellow walls — told — [m12]
- sensory: radio on, mostly ball games — told — [m12]
- person: Mom — [m12]

Bad:
- sensory: "cozy, warm kitchen smelling of coffee" ← "cozy", "warm", "coffee" never said.
- meaning: "the kitchen was the heart of the family" ← inferred meaning.

**Input** — AI: "Was that your grandfather's farm?" Elder: "yes"
Good: fact: the place was grandfather's farm — **confirmed** — [m20]
Bad: fact: … — **told** ← the elder never said it in their own words.

**Input** — Elder: "I think it was '52, maybe '53"
Good: fact: year ≈ 1952 or 1953 — unsure — quote: "I think it was '52, maybe '53"
Bad: fact: year 1952 — told

---

## Step 2 — Outline (story skeleton)

### Rules
1. Pick **one story per outline**: one place, one event, or one recurring ritual. If material covers two, split.
2. Shape: `opening image` → `what happened` → `turn` (what changed, surprised, or stuck) → `close`.
3. Opening image = the most concrete `sensory` or `fact` row. Never open with birth date, "I was born", or a summary.
4. Close = the elder's own `meaning` row if one exists; otherwise end on the last concrete image. **No moral the elder didn't state.**
5. Every slot lists the row ids it uses. A slot with no rows is a **gap**.
6. Output gaps as follow-up questions for the conversation model (max 3, most concrete first), e.g. "What did your mom do while the game was on?" not "Tell me more."
7. A story is ready to write when it has an opening image, at least one event, and one of (turn or meaning). Otherwise mark `needs_more`.

### Examples
Good outline:
- opening image: yellow walls, radio playing ball games [r2, r3]
- what happened: Saturday afternoons helping Mom roll pie dough [r5, r6]
- turn: the first pie he made alone, which fell apart [r8]
- close (meaning, told): "That's when I figured out Mom wasn't perfect either, she just kept going." [r10]
- gaps: none

Bad outline:
- opening: "Growing up in the 1950s was a simpler time." ← no source, summary opening.
- close: "These memories taught him the value of family." ← invented moral.

Good gap → question:
- gap: no sensory detail for the farm → "What's the first thing you'd notice walking onto your grandfather's farm — a smell, a sound?"
Bad: "Can you describe the farm in more detail?"

---

## Step 3 — Draft (the story)

### Voice rules
1. First person, past tense, plain American English, about 6th–8th grade reading level.
2. Short sentences. Mostly ones the elder could have said out loud.
3. Keep `quote` rows verbatim when they fit; aim for at least 2 verbatim phrases per story.
4. No more adjectives than the elder used. No literary metaphors ("like a warm embrace", "tapestry", "bittersweet symphony").
5. Keep hedges: `unsure` stays unsure ("I think it was '52"). `heard` stays attributed ("Mom always said I…"). `confirmed` facts are stated plainly but never embellished.
6. Never describe the elder's feelings unless a row says them.
7. Length: 300–800 words for the text beta; shorter is fine if material is thin. Never pad.
8. Title: 2–5 words, from a concrete image or the elder's own phrase ("Mom's Radio", "The Pie That Fell Apart").

### Allowed edits
- Reorder; add connectives ("That summer", "Later").
- Merge repeated statements into one sentence.
- Turn Q&A into narration (AI: "Was it cold?" Elder: "freezing" → "It was freezing.").
- Fix grammar only where the error is clearly a typo, not their way of speaking.

### Not allowed
- New facts, places, names, dates, weather, smells, colors, feelings, dialogue.
- Moral summaries, "looking back" reflections, or foreshadowing the elder didn't give.

Every sentence carries `source_ids` (from rows → message ids).

### Examples
Material: yellow walls; radio with ball games; Saturdays rolling dough with Mom; first solo pie fell apart; quote "Mom wasn't perfect either, she just kept going."

Good:
> Our kitchen was small, with yellow walls. Mom always had the radio on, ball games mostly. On Saturdays I helped her roll out the pie dough. The first pie I made by myself fell apart before it got to the table. That's when I figured out Mom wasn't perfect either. She just kept going.

Bad:
> Sunlight streamed through the window of our cozy yellow kitchen, where the smell of cinnamon mingled with the crackle of the Dodgers game. Those Saturday afternoons with Mother were the happiest of my life, a sweet lesson in patience I would carry forever.
Problems: sunlight, cinnamon, Dodgers, "happiest of my life", "lesson I would carry forever" — none sourced; "Mother" changes their word "Mom".

Bad (too literal, also fails):
> Kitchen was small. Yellow walls. Mom radio ball games mostly. Yes. Saturdays dough.
Problems: copies fragments; didn't turn Q&A into narration.

---

## Step 4 — Check

### Rules (code first, then model)
1. **Code:** delete any sentence with empty or invalid `source_ids`.
2. **Model, sentence by sentence**, flag:
   - `added_detail` — a fact, sensory word, feeling, or name not in the sources.
   - `certainty_drift` — unsure/heard stated as certain.
   - `voice_drift` — word swap that changes their voice (Mom → Mother, kids → children).
   - `moral` — a reflection not said by the elder.
3. `added_detail` and `moral` → remove or rewrite from sources. `certainty_drift` → restore hedge. `confirmed`-only facts and conflicts → highlight for the elder to confirm in review.
4. Elder-edited sentences are locked; never re-check or rewrite them.

### Scoring rubric (per story, 1–5 each)
- **Faithfulness** — no unsourced content (any `added_detail` caps at 2).
- **Voice** — sounds like this person; verbatim phrases kept.
- **Concreteness** — opens on an image; specific over general.
- **Shape** — one story, clear turn or meaning, no tacked-on moral.
- **Readability** — flows as narration, not fragments.
Ship threshold: Faithfulness = 5 and all others ≥ 3.

---

## Whole-chapter assembly (Childhood)

1. Use only stories the elder confirmed in review.
2. Order by the elder's age when it happened; if unknown, by place (home → neighborhood → beyond).
3. Chapter opening: one or two sentences built from sourced facts (where and when they grew up). No "Every childhood is a journey."
4. Transitions: max 1–2 sentences between stories, only sourced facts ("We moved to Dayton the year I turned nine." — only if they said it). If no sourced bridge exists, use a section break instead.
5. Keep each story's title as a subheading.
6. Target 2,500–4,000 words for the text beta. Never pad to reach it; report the shortfall and the top gaps instead.
7. End the chapter on the elder's own words if possible, not on a summary.
