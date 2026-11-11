# Memoir v1 · UI handoff (hi-fi v3)

Internal test, web first (Next.js). iPhone baseline 393×852 pt. All screens in this folder are real HTML/CSS, not pictures: open `NN-*.html` in Chrome and use DevTools to read any size, color or spacing. PNGs are @3x renders of the same files.

Sample content: the elder "Walt" is fictional (copy from 传记作者, `ui-sample-copy-v1.md`). Topic names follow `childhood-topics-v1.json`; button labels follow the 产品 requirement doc.

## 1. Files
| File | What it is |
|---|---|
| `01-home.html` … `06-chapter.html` + `.png` | Six core screens, one viewport each |
| `01-home-full`, `03-review-full` | Same screens, full scroll length |
| `07-components.html/.png` | Every component state (buttons, input, AI states, marks, tags, sheets, empty/error, icons, colors) |
| `*-xxxl`, `*-ax3` | Large text check for Home and Story |
| `board-A/B/C.jpg` | Review boards with numbered notes |
| `icons/ic_*_24.svg` | All icons |
| `design-tokens-v1.json` (v1.1) | Single source of design values; new values added this round |

## 2. What to slice (almost nothing)
- **Icons:** SVG only. 24×24 artboard, 1.75 stroke, round caps and joins, `stroke="currentColor"`, no fills except the three dots in `more`. Name `ic_<name>_24.svg`. Use at 20, 22, 24 or 26 px by setting width/height; never redraw at other sizes. Inline them as React components (SVGR) so color follows text.
- **Illustrations and photos:** none in v1. If added later: SVG, or WebP at 2x and 3x (`name@2x.webp`, `name@3x.webp`).
- **Status bar and home indicator** in the mockups are for presentation only. Don't build them.
- **App icon / PWA icons:** not needed for local internal test. Later: 180 apple-touch, 192 and 512 maskable PNG.
- **Flutter later:** same SVGs via `flutter_svg`; tokens map 1:1 (pt = logical px).

## 3. Values not to hard-code
Everything comes from tokens. New this round: `successSoft`, `uncertainBorder`, `uncertainText`, `chapterReading` (20/1.6), `overline` (13/600, uppercase EN only), `tag` (13/600, height 28), `navHeight` 52, `headerButtonHeight` 44, `compactButtonHeight` 48, `micSlot` 56.
Fonts in code: `var(--serif)` = New York → Iowan → Georgia; `var(--sans)` = system (-apple-system / SF Pro); Chinese = PingFang SC. Mockups are rendered with Source Serif / Inter as stand-ins, so real devices will look slightly tighter.

## 4. Screen specs
**Page:** padding 20 left/right, content max width 600 centered on larger screens. Nav row 52 high; nav text buttons 48 hit area.

**01 Home** — greeting `display` 34; progress line `body` text2, 10 below. Continue card: accent fill, radius 20, padding 22/20/20, white inner button 56. Section header `overline` + "See all topics" (15/600 accent). Topic card: radius 20, padding 16/8/8/18, title serif 19/500, hint `caption`, "Not now" text button left, "Start →" right, `more` menu 48×48 top-right. Free-talk row 64 high. Bottom bar: secondary full-width "My memoir", fixed, 12 top / 34 bottom padding, fade gradient behind it; page needs ≥140 bottom padding so the last card isn't hidden.

**02 Story** — header: overline (chapter) + topic serif 20/500; "Done for today" secondary 44. Divider full bleed. Conversation is **bottom-anchored** (column, justify end): old Q&A at 60% opacity, AI lines `body` text2, user bubbles white, 1px border, radius 18/18/6/18, inset 36 left. Current question `question` 24 serif, 16 above input. Input: white, radius 20, 1.5 border, min 112 high, text 19; focus = accent border + 4px accentSoft ring. Footer row: "Saved as you go" caption; 56 empty slot (v2 mic, invisible in v1); "Send" primary.

**03 Review** — tag + `title` 28 + `reading` 19. Uncertain: amber dotted underline 2px on `uncertainSoft`, question card right below the paragraph (uncertainSoft, 1px uncertainBorder, radius 14, padding 16; answers are 48-high secondary buttons). Tapped sentence: accentSoft background; source card below (quote icon + overline + original message verbatim, including lowercase). Fixed bottom: "Looks good" primary full width, then Edit / Tell more half width, sheet shadow.

**04 My memoir** — centered overline + book title `display`, 40×2 accent rule. Chapter rows 56 high, 1px top border, number + serif name in `textDisabled`, "We'll get to this later" after the name. Growing Up expanded: name serif 22, story cards (title serif 18, first sentence serif 16 text2, word count 14, "Needs a look" tag). Under the cards: one caption line until 6 confirmed stories, then the "Put my chapter together" primary button in the same spot.

**05 Story detail** — tags row, title, "Told <date> · N words", reading text. Action rows 56 high with 22 icons; "Remove" uses `error`. Primary "Tell more about this" at the bottom.

**06 Chapter** — centered overline "Chapter 2", `display` title, "From N of your stories", rule. Body `chapterReading` 20/1.6, paragraphs after the first indented 1.4em. Tapping a sentence opens the bottom source panel (white, radius 20 top) with Edit / Write it again.

## 5. States (all drawn in `07-components`)
- Button: default, pressed (`accentPressed`), disabled (muted bg, textDisabled), loading (spinner + "Writing…", not tappable), focus ring 2px `focusRing` with 3px gap.
- Input: empty (placeholder textDisabled), focused, send failed (error border + one line of error text; typed text stays).
- AI: Thinking… (three dots, pulse 1400 ms), typing in (18 ms/char), over 20 s retry card ("Your answer is saved" + Try again).
- P3 writing: "Writing up your story…" + "You can leave anytime".
- Empty: first visit welcome; empty chapter tap → toast "We'll get to this one later." All 12 topics done → one sentence pointing to free talk or "Put my chapter together".
- Sheets: Change topic (3 topics + "Skip this topic for now"), Remove confirm (error button + "Keep it").
- Motion: `base` 250 ms for fades, `sheet` 350 ms for sheets; with reduced motion, only a 120 ms fade and no typing effect.

## 6. Large text (board C)
Use `rem` for every font size so iOS / browser text size applies; spacing stays in px. Checked at 1.35× (iOS xxxLarge) and 1.75× (AX3):
1. Story header: "Done for today" drops under the topic name.
2. Conversation stays bottom-anchored, so overflow cuts old Q&A, never the current question or the input.
3. At ≥1.6×, earlier Q&A hides behind "Show earlier answers".
4. Home scrolls; "My memoir" stays fixed at the bottom.
5. Buttons hug their text; labels may wrap to 2 lines but never truncate. Status bar never scales.

## 7. Chinese check
Chinese uses the zh line heights in tokens (about 0.2 taller). Overline stays unchanged in Chinese (no uppercase, no letter spacing). Chinese renders are not in this round; English is primary.
