# Design notes: churn intelligence

## Brief

- **Subject:** an end-to-end churn analysis of 7,032 telecom customers (IBM Telco sample): spreadsheet audit, PostgreSQL and PySpark features, an XGBoost model explained with SHAP, a Power BI report and a RAG chatbot.
- **Audience:** recruiters skimming for a minute, and technical interviewers who will read the SQL.
- **Single job:** show that the project goes from a messy table to a decision (who leaves, why, what to do) with every number traceable to the data.

This is a standalone site for the project, not a personal portfolio. The copy is neutral ("this project", "the model"); the only personal line is the footer credit.

## Reference and what was taken from it

The reference (`reference/screenshot.png`, `reference/style.css`) is a Swiss designer's site:

| Reference trait | Value | Used here as |
| --- | --- | --- |
| Palette | `--black #000`, `--white #fff`, `--grey grey`, body `#333` | Ink and Paper, plus greys; no accent in the reference |
| Type | PP Neue Montreal Book, `text-transform: lowercase`, 14px, 125% leading | Host Grotesk (closest free match on Google Fonts), lowercase headings and UI |
| Grid | 4 columns, narrow outer margins, images edge to edge in cells | Same 4-column grid from 1024px, 2 at 768px, 1 on phones |
| Section header | one row across four columns: title and blurb, discipline, year, ↗ | Every section opens with this row: name and job, tools, phase, source file |
| Hero | one large lowercase statement, first line indented, wrapping to the left edge | Same hanging first-line indent on the headline |
| Signature | a narrow column of grey ASCII texture running down the page centre, behind the content | The **customer spine**: the same idea, but every glyph is a real customer |
| Chrome | no radius, no shadow, almost no borders; whitespace separates | Same. Rules only inside tables and the pipeline list |

## Tokens

### Colour

| Name | Hex | Role | Contrast on Paper |
| --- | --- | --- | --- |
| Paper | `#FFFFFF` | page background | — |
| Ink | `#000000` | text, chart bars, buttons, active tabs, focus rings | 21:1 |
| Graphite | `#5C5C5C` | secondary text, captions, axis labels | 6.7:1 |
| Stone | `#8A8A8A` | "stayed" marks in the hero field; never text | 3.4:1 (graphics) |
| Fog | `#F2F2F2` | code blocks, table header, correct cells in the confusion matrix | surface only |
| Churn Red | `#C8261B` | churned customers, and the single highest-rate bar in each chart | 5.6:1 |

Two tints exist only for the spine, which sits behind content: stayed `#D9D9D9`, left `#EBAAA4`. Text never sits on them (see "spine" below).

Rules: red always means *churned or highest risk*. It is never used for buttons, links or decoration. Everything interactive is Ink. The Power BI screenshots are light (canvas #F2F2F2, white panels, Churn Red as the only accent), so the dashboard sits on Paper and its screenshots share the hairline frame used for the SHAP and ROC images. The n8n workflow is the one dark image and keeps its own Ink plate.

The Power BI screenshots use purple. That purple stays inside the screenshots; nothing else on the site is purple.

### Type

- **Host Grotesk** (Google Fonts, 300–600): headlines, UI, body, tables. Tabular figures (`font-variant-numeric: tabular-nums`) wherever numbers line up.
- **Geist Mono** (Google Fonts, 400–500): only the SQL and PySpark code, and the spine glyphs. It is deliberately not used for small labels.
- Both load from Google Fonts with `display=swap`. The stylesheet link is non-blocking (`media="print"` swapped to `all` on load, with a `<noscript>` copy).
- Fallbacks: `"Host Grotesk", "Host Grotesk Fallback", "Helvetica Neue", Arial, sans-serif` and `"Geist Mono", ui-monospace, "SFMono-Regular", Consolas, monospace`.
- `Host Grotesk Fallback` is local Arial scaled to Host Grotesk's measured metrics (`size-adjust: 105.68%`, `ascent-override: 96.05%`, `descent-override: 29.81%`, taken from the Google Fonts file with fontTools). Without it the hero headline reflowed when the web font arrived, which cost 0.37 CLS on desktop; with it, CLS is about 0.01.

Headings, nav and labels are lowercase like the reference. Prose stays in sentence case, and acronyms keep their casing everywhere (XGBoost, SHAP, PySpark, SQL, DAX, AUC, RAG, n8n).

| Step | Size | Line height | Tracking | Use |
| --- | --- | --- | --- | --- |
| caption | 13px | 1.35 | 0 | figure captions, sources, chart ticks |
| ui | 15px | 1.45 | 0 | nav, row headers, tables, buttons |
| body | 17px | 1.6 | 0 | prose, max 66ch |
| h3 | 24px | 1.2 | −0.01em | sub-headings, insight callouts |
| statement | 32 → 48px | 1.05 | −0.02em | one big sentence per major section |
| figure | 32 → 44px | 1 | −0.02em | the three contract rates in the hero |
| hero | 36 → 96px | 0.98 | −0.035em | the h1 only |

### Layout

- Margins 16px (phones), 20px from 768px. Gutter 20px.
- Columns: 1 → 2 (768px) → 4 (1024px). No max width: the grid runs edge to edge like the reference; prose is capped by `ch`.
- Section spacing: 96px on phones, 160px from 1024px.
- Radius 0 everywhere. No shadows.

## The signature: one mark per customer

1. **Hero field.** The three contract groups drawn on canvas, one mark per customer: churned customers as red squares, stayed as small Stone dots. Churned marks fill first, so each block reads as a waffle chart whose red share is the churn rate. Each group is labelled with its rate and "x of y left". On phones, if the hero would be taller than 1.5 screens, the field switches to 1 mark = 10 customers (rounded) and says so.
2. **Spine.** From 1024px, the whole dataset runs down the page centre as two overlaid text blocks (one for `·` stayed, one for `×` left), ordered by the model's predicted risk. It is set in 10px Geist Mono, and the column count is recalculated so the 7,032 glyphs span from "the question" to "limitations" (about 7 columns, 60px wide at 1440px), so it sits mostly in the centre gutter. Its caption reads "actual outcome, ordered by the model's predicted risk". Red thins out as you scroll, which is the model working. Text blocks have a Paper background so they occlude the spine instead of sitting on it; that is also how the reference behaves, and it means no text ever has to meet contrast against a glyph.

Both are drawn from `data/site_data.json`, so they are exactly the CSV.

## Charts

Chart.js 4.4.1 (pinned). Horizontal bars in Ink; the highest-rate bar in each view is Churn Red. Values are printed at the bar ends, so hover is extra, not required. Every chart has an `aria-label` and a "view data table" toggle. Insight sentences are filled from the data file, not typed in.

## Motion

One moment: on load the hero field fills in, row by row, in about 1.2 seconds, then the three rates fade in. Findings charts draw once when a tab is first shown. Hover states only change colour or underline. With `prefers-reduced-motion`, everything renders in its final state.

## Critique log

- Red on white with a black grotesk is a stock Swiss look. Kept because the reference is Swiss and red carries a data meaning; restricted to churn so it never becomes decoration.
- Monospace for small labels is a known generated-site tell. Mono is only for code and the spine.
- The reference's ASCII texture is decorative. Here every glyph is a customer, so the device encodes something true.
- Metric "cards" drift toward a stat row. Model metrics are a single definition row next to the native confusion matrix.
- No uppercase eyebrows, no middle-dot meta strings, no → on buttons. ↗ marks links that leave the site, which is what it means in the reference too.
- Stone replaced the planned Mist `#C9C9C9` for the hero's "stayed" marks: Mist was 1.6:1 against Paper, too faint to read as data.

## Review pass (CLAUDE.md section 9)

Changed after looking at the built page:

- Code panels overflowed the page at 375px (a grid item grew to its longest line). Fixed with `minmax(0, 1fr)`.
- The spine was 86px wide and ran into column 3; it is now 10px glyphs, about 60px wide.
- Power BI exports carry a pure-white margin; `scripts/optimize_images.py` trims it (originals untouched). The threshold is 6 levels from white, because the #F2F2F2 canvas is only 14 away and a looser threshold cut into it unevenly.
- Column labels in section headers ("tools", "what it produced", "action", "evidence") are hidden below 1024px, where the rows below are not columns.
- The risk filter is a 2 × 2 grid on phones instead of a ragged wrap.
- "month-to-month" and "two-year" no longer break at their hyphens in the headline.
- Probabilities are truncated, not rounded, so a Low customer at 0.39998 never displays as 0.400.
- The hero fill has a timer fallback, so a throttled background tab never leaves it half drawn.
- **Removed:** the big statement in "what drives churn".

## Audit pass

- Hero: headline max size 5.5rem (was 6rem), tighter top spacing, and 4px marks from 1024px (5px below). At 1440 × 900 the whole thesis, headline and all three contract blocks, now fits on the first screen.
- SHAP plots sit side by side at equal width across columns 2–4 instead of one narrow and one wide, so the bar chart's labels are readable. SHAP and ROC images open in the lightbox, like the dashboard.
- "Ask the data": the offline card and the prompts stack in one left column; the workflow is a single dark panel on the right.
- Explorer columns reordered to ID, probability, risk, contract, tenure, charge, so a phone shows the risk without scrolling sideways. Paging returns to the top of the table.
- Findings chart uses 20% ticks on phones so axis labels don't collide.
- Nav highlight clears in sections that have no nav link.
- Code strings are graphite, not underlined (they read as links).
- The lightbox locks page scroll while open.
- Layout shift: the spine is hidden until positioned, and `scrollbar-gutter: stable` lets the hero canvases be measured at their final width.

## Chat widget theming (@n8n/chat 1.38.7)

- The widget renders into the page (no shadow root, no iframe), so site CSS reaches it.
- Its stylesheet declares every variable on `:root`, and derived ones like `--chat--header--background: var(--chat--color-dark)` are resolved there. Overriding a base colour on a descendant does nothing, so `.n8n-chat-host` in `sections.css` sets each variable the widget's rules read directly. This version's names differ from older docs (`--chat--color--primary`, double hyphen).
- Header ink, bot bubbles paper with a hairline, user bubbles ink, input and a text "send" button like the site's form controls, Host Grotesk via `--chat--font-family`. A scoped rule removes every radius and shadow in the widget.
- The spine's white "occlusion" backgrounds are excluded inside `.chat-slot`; they were painting white boxes behind the subtitle and message text.
- `chat.js` keeps the widget's `scrollIntoView` calls inside its own message list, so a new answer no longer scrolls the page. It repeated the ranked list and the beeswarm caption, and made three statement-size sentences in a row.
