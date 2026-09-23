# Design System: AIOS Console

> Purpose: AIOS front-end style authority for humans, Codex, and `stitch-design-taste`.
> Scope: `apps/web-vite/src/` pages, shared components, dashboard charts, DataOps console, reports, and marketing/workspace shells.
> Runtime source: `apps/web-vite/src/styles/design-tokens.css` is the CSS variable entrypoint; Tailwind, Ant Design, and ECharts must map back to it.

## Brand & Product Context

- Product name: AIOS (formerly DataHub); company-qualified name: Groland AIOS.
- Product tagline: AI 驱动的业务生产力系统.
- Naming transition: this remains the same product and visual baseline. Preserve the retired Agent boundary and existing design language while technical identities migrate under the release plan.
- Domain: enterprise data operations, commerce analytics, reporting, and internal data-product workflows.
- Core users: operators, analysts, founders, and internal data/BI maintainers who read dense metrics daily.
- Primary scenarios: dashboard monitoring, weekly/monthly reports, DataOps runtime diagnosis, creator/live/traffic analysis, and operational admin.
- Design direction: company-branded light enterprise console with DeepSeek-like typographic discipline: restrained, neutral, spacious, data-first, and low-noise.
- Brand source: pure white `#FFFFFF` plus light gray `#F5F5F5` for space, modern SaaS blue `#2F6EEA` for primary fills, accessible blue text `#2457C5` for links/small text/icons, and matte black `#1A1A1A` for text/logo/title.
- Existing constraints: Vite + React + React Router, Ant Design v6, Tailwind CSS v3, CSS Modules, ECharts, CSS variables.
- Do not blindly copy DeepSeek dark mode or SVG wordmark. Absorb its font hierarchy, neutral gray rhythm, tabular numeric feel, quiet buttons/tags, and sparse data layout while keeping AIOS's white/gray/blue brand authority.

## Page Archetypes

### Retired Agent Product Boundary

- AIOS no longer owns an Agent governance workspace or an `/agent` product surface. Do not add an Agent route, navigation item, permission helper, API client, runtime panel, success-shaped tombstone, or proxy to another product.
- New Money Desktop owns local OpenViking and private memory. The sibling New Money service owns hosted accounts, teams, project membership, entitlements, and versioned shared knowledge; AIOS must not recreate those responsibilities.
- Historical migrations, database tables, changelog entries, and operational records may continue to name Agent concepts. Their retention is historical or data-governance evidence, not authority to expose an active product surface.
- The `Agent Implementation Protocol` below governs coding-agent contributions to this repository. It is unrelated to the retired AIOS Agent product and remains in force.

### Dashboard Pages

- Primary job: monitoring and decision support.
- Start with filters, KPI rows, charts, tables, and drilldowns; do not introduce marketing hero sections.
- Prefer compact but readable surfaces. Cards are allowed when they group a chart, table, or task boundary.
- Important KPI groups may use unboxed metric rows separated by whitespace, following the DeepSeek open-platform usage page rhythm.
- Industry material inspiration dashboards are operational evidence tables, not editorial reports: lead with month/source filters, a compact summary strip, and one wide sortable table for素材/品牌/曝光/效率 metrics.
- New dashboard insight routes under `apps/web-vite/src/app/dashboard/**` must stay in the dashboard grammar even when the subject is marketing content: restrained white/gray/blue surfaces, tokenized table typography, fixed/frozen columns only when needed for dense scanning, and explicit empty/error/loading states.
- Route-level CSS Modules for dashboard insight routes may define local material aliases for elevation and subtle table surfaces, but raw colors, decorative gradients, and bespoke chart palettes require this authority document plus token/source updates before production use.

### Report Pages

- Primary job: explain what changed and why.
- May be more editorial than operational dashboards, but must still use AIOS typography, tokenized colors, and tabular numbers.
- Use section rhythm, summaries, chart groups, and clear evidence blocks. Avoid decorative storytelling that weakens scanability.
- Static special reports inside the console may use a document-style left table of contents, chapter dividers, and page-like evidence sections. Keep them in the AIOS white/gray/blue system, treat platform colors as chart/category markers only, and prefer static snapshot content over opening-time report API calls.
- Special reports should stay business-first: lead with the operating conclusion, then show the strongest visual evidence, platform detail, and explicit data gaps. Do not add customer-delivery appendices unless the route is an export/delivery artifact rather than an in-console report.

### Static Special Reports

This contract applies to `apps/web-vite/src/app/reports/special/**` and future in-console special reports such as monthly business reviews, platform diagnostics, product diagnostics, industry insight reports, competitor analysis, content-operation reviews, and media-spend reviews.

- Primary job: answer a business question with a static analytical narrative and visual evidence. A special report is not a dashboard, marketing page, or collection of equal-weight cards.
- Default reading order: cover summary -> operating conclusions -> chart evidence -> business breakdown -> recommended actions -> evidence gaps and methodology notes.
- Cover front matter grammar is mandatory: front matter, not a dashboard hero. Use report title/question, period/source/scope metadata, data status or snapshot note, one operating conclusion, compact KPI strip, and one quiet caveat footnote. It should read like the first page of a formal report, not a dashboard landing page.
- Cover density budget: one report question, one primary operating conclusion, three to four critical KPIs, and one methodology/caveat footnote. Move supporting conclusions into the first body section instead of stacking badges, KPI walls, or secondary conclusion cards on the cover.
- Cover visual direction: use a formal editorial report cover, not a routine white dashboard header. A good cover may use a restrained full-height color field, large left-aligned report title, period/source metadata, a lower-left caveat footnote, and three right-side key finding cards. It must still stay inside the AIOS neutral/blue system and avoid marketing-page hero decoration.
- Hard rule: one analytical question gets one dominant visual. Each report page or major section should have one dominant question, one primary conclusion, one primary visual proof, and at most one secondary evidence group. If two visuals make independent claims, split the page; if a support visual repeats the same claim, demote or delete it.
- Page headers should use a quiet document path such as `Chapter / Section / Page`, then a page title and one concise summary. Do not repeat source tags, section chips, or decorative metadata that do not help navigation.
- Charts are evidence, not decoration. Every primary chart needs a title, metric/unit/period context, a visible takeaway, and a methodology or data-source footnote when the metric can be misunderstood.
- Tables are secondary evidence. Long tables should sit below the primary visual, inside an evidence block, or behind progressive disclosure; they must not become the main page layout unless the report question is explicitly table-first.
- Do not repeat the same meaning twice. If a matrix/table and the primary chart answer the same question, keep the stronger chart as the visible proof and move exact rows into a drawer, export, caption, or footnote. A visible table/matrix is allowed only when it adds a different reading task such as dense scanning, ranking, gap diagnosis, source coverage, audit reconciliation, or action ownership.
- Table demotion ladder: duplicate rows or matrices move to drawer/export/footnote; exact audit rows use a closed `EvidenceDrawer` with an opener summary and default 8-row cap; dense scanning uses tile heatmap, compact matrix, or approved visual table only after the answer is known; table-first sections require a worksheet exception; source inventory and definitions belong in methodology compact tables.
- Footnote placement is part of the layout contract. Figure footnotes live inside the figure after the caption, page footnotes live after the evidence block or in the lower-left page note area, and a cover may use a lower-left methodology footnote. Route-wide caveats live in methodology. Do not carry source/caveat text in subtitles, chips, or repeated corner badges.
- The left table of contents is document navigation. Keep chapter and page labels stable, hide or collapse noisy micro-anchors when they do not improve reading, and keep deferred chapters visible as report placeholders with clear missing-evidence language.
- Micro anchors may exist for export, deep links, and smoke checks, but they should be explicitly marked as hidden navigation anchors and must not appear in desktop or compact TOC unless they improve reading.
- TOC numbering must be visually coherent. The global visible TOC may use Roman markers only for the top-level chapter skeleton (`I/II/III`). For visible descendants, section and page rows should use indentation, typography, and title-only labels; they must not display visible decimal markers such as `1.1` or `1.2`. Stable decimal indexes may remain as internal metadata for deep links, tests, and source ordering, but they must not appear as visible TOC markers. Local proof sequences inside a chapter may also use Roman markers when they improve reading.
- Platform colors are allowed only for chart marks, legend markers, and category indicators. Body text, page chrome, cards, and callouts must remain in the AIOS neutral/blue system.
- Deferred sections must look intentional: name the future question, the missing evidence, and the expected next artifact. Do not leave empty dashboard cards or generic "coming soon" blocks.
- In-console special reports default to static snapshots for reproducibility and load performance. Opening a report should not fan out to multiple live report APIs unless freshness is a documented requirement for that route.
- Keep report composition modular: shared shell, TOC, page header, chart evidence panel, evidence table, deferred placeholder, and domain-specific content modules should have clear boundaries. Do not let one route component own multiple full chapters, chart builders, table renderers, and copy blocks.
- CSS Modules for special reports should be split by stable responsibility such as shell, TOC, report page rhythm, evidence blocks, chart panels, and domain-specific layouts. Do not add new oversized CSS Modules when a page can be split by report grammar.

#### Special report execution checklist

Use this 10-point checklist before implementation, visual smoke, and export review:

1. One page or major section answers one business question; split mixed mental models.
2. One question gets one dominant figure; tables and drawers prove exact rows after the figure.
3. The TOC stays quiet navigation; on mobile it must not steal the first screen from the answer.
4. At 390px, wide matrices become stacked cards or concise row groups; never force page-level horizontal scroll.
5. The title, takeaway, and direct labels carry the claim; hover only deepens inspection.
6. Footnotes name source, period, unit, calculation, and missing-value caveats; keep them short and muted.
7. Corner notes are only for source, caveat, and missing-evidence language; never use them for the main takeaway.
8. Long tables are secondary evidence; cap visible rows or move full reconciliation into disclosure/export.
9. Visual smoke checks chart mount, overlap, clipped labels, and horizontal overflow across desktop, tablet, and mobile.
10. Export/print review proves lazy charts render and captions/footnotes travel with the figure.

#### Static report visual selection principle

Pick the visual by cognitive job, not by available data shape:

- First write the analytical question, then select one chart family and one dominant visual. A route worksheet or candidate registry may name future visuals, but candidate status is not production approval.
- Scale over time: use rounded vertical bars or annotated bar-line when the x-axis is naturally ordered months/years and there are only a few decisive periods. Keep labels large and direct; do not convert a sparse trend into a wide table.
- Cross-period movement: use connected dots, dumbbells, or slopegraphs when the reader needs to see before/after, current/reference, rank shift, or CAGR-style movement.
- Rank and contribution: use modern ranked bars or lollipop rows when the reader needs order, distance, and outliers. This is the default replacement for long "Top N" tables.
- Top list change by year/period: use multi-column top-list cards when the story is which entities enter, leave, or hold a top position across periods.
- Reference or target judgment: use bullet charts, benchmark bands, or target lines when a named benchmark exists and the conclusion is above/inside/below a band.
- Role or priority: use quadrant bubbles, impact x urgency matrices, or risk quadrants when two dimensions define the action.
- Mix or composition: use horizontal composition bars or small multiples when components are additive and the route needs mix shift.
- Dense diagnostic scanning: use tile heatmaps or compact matrices only after the main figure has answered the question. They are support evidence, not a second primary answer.
- Exact row reconciliation: use evidence drawers, capped tables, export, or footnotes. Do not make exact rows compete with the primary figure.
- The executable decision tree, chart-family matrix, approved/candidate visual status, and table demotion ladder live in `docs/SPECIAL_REPORT_CHART_GALLERY.md`; use that guide before trying chart variants in a route.

#### Static report implementation policies

- Static-report chart template catalog is the first implementation boundary: map each chart to an approved gallery template or static visual before adding local chart grammar. Candidate visuals such as `top-list-cards`, `visual-ranked-table`, `slopegraph`, `waterfall-delta-bridge`, `small-multiples`, `coverage-confidence-strip`, `distribution-long-tail-strip`, and `action-ownership-list` stay candidate-only until they add `DESIGN.md` guidance, gallery fixture coverage, catalog/static-visual entry, and smoke expectations before production use.
- Candidate registries are planning aids, not approvals. `SPECIAL_REPORT_CANDIDATE_VISUALS` must remain separate from `SPECIAL_REPORT_CHART_CATALOG` and `SPECIAL_REPORT_STATIC_VISUAL_CATALOG`; adding a candidate name to docs or a worksheet does not make it production-approved.
- Concrete static-report chart templates, fixture coverage, and smoke expectations live in `docs/SPECIAL_REPORT_CHART_GALLERY.md`; do not duplicate those implementation details in ad-hoc page components.
- Route-level pacing, page archetypes, and composition examples live in `docs/SPECIAL_REPORT_PAGE_COMPOSITION.md`; use that reference before adding or reordering report sections.
- Each static chart template should declare the question it answers, sorting/comparison rule, primary value label, and evidence destination for exact rows. Do not add a bespoke chart when an existing template can answer the same question with fewer marks.
- Tooltips are inspection aids only. If a formatter carries the primary number, caveat, label, or comparison needed to believe the claim, promote that evidence into the title, takeaway, direct label, caption, table, or footnote.
- Evidence drawers may expand audit rows, but the opener must show a top summary before rows: sort key, shown count, total count, source period, and omission rule. Drawer tables should cap the initial rendered rows at 8 by default; use an explicit audit-only override, filtering, pagination, or export for larger row sets.
- CSS Module boundary policy: shared report grammar classes live in shared report modules/style maps; domain-specific classes stay with the domain module. Do not import another domain module for one-off styling or grow a module across shell, chart, evidence drawer, and business layout responsibilities.
- ECharts module registration/performance policy: register only required ECharts charts/components at module scope or in a guarded shared adapter, never inside React render. Prefer tree-shaken imports over full-bundle imports, memoize option objects when inputs are stable, and ensure lazy charts dispose cleanly on unmount.

#### Static report cognition grammar

- Use an answer-first pyramid: report question -> executive answer -> 3-5 supporting arguments -> visual evidence -> table/detail proof -> action or open question.
- A page is successful when a reader can understand the conclusion from the page title, lead sentence, dominant figure, and one footnote without reading every table cell.
- One page or major section should answer one business question. If two visuals need different mental models, split them into separate figures or a stacked sequence instead of placing them as equal-weight cards.
- Prefer single-column wide figures for decisive evidence. Use two-column layouts only when the comparison itself is the point, such as before/after, current/benchmark, or platform A/platform B.
- Pages that use a numbered conclusion or argument list followed by the primary evidence block must use the shared conclusion-to-evidence rhythm: `var(--spacing-10)` on desktop (40px) and `var(--spacing-8)` on mobile (32px). Do not add page-specific chart `margin-top` overrides unless the page uses a different report archetype.
- Use typographic hierarchy to reduce work: concise title, 1-2 sentence lead, dominant numeric emphasis, quiet annotation, and muted methodology note. Avoid repeated badges, chips, source labels, and decorative metadata.
- Keep prose width readable. Long paragraphs should stay near prose width; chart and table evidence may be wider. Do not stretch explanatory copy across the full report canvas.
- Reading fatigue budget per page: one dominant figure, no more than 5 highlighted numbers, no more than 2 callouts, no more than 1 secondary evidence table, and no more than 6 visible legend categories unless the page is explicitly about category breadth.
- If a section needs many rows, make the chart carry the conclusion and put rows into a compact evidence table below it or behind progressive disclosure.

#### Static report route pacing contract

- A route should read as a formal report with a cover and 6-9 primary reading sections. Count the sections a business reader sees in the TOC, not hidden anchors, smoke handles, drawers, or row-level audit appendices.
- Use the answer-first pyramid at route level: cover question -> executive answer -> 3-5 supporting arguments -> chart-first evidence pages -> platform/detail proof -> action priorities -> methodology and evidence gaps.
- If the report naturally wants more than 9 primary sections, compress before implementing: merge adjacent pages that answer the same question, demote exact-row material into evidence drawers, move repeated caveats into methodology, or split the route into a second report.
- More than 12 primary reading sections is a route-design failure for an in-console static report unless the user explicitly asks for an appendix-heavy export artifact. Add a compression rationale before accepting the exception.
- Long platform runs should group by role or decision sequence, not by every available source table. A platform detail page exists when it changes the operating answer or action priority.
- Keep the first body section decisive. It should restate the executive answer and map the 3-5 arguments; do not make readers reach page 4 before seeing the business conclusion.
- Table-heavy sections should be demoted into evidence pages, drawers, or methodology appendices. If a table becomes a primary section, the route must document why the question is explicitly table-first.

#### Static report figure contract

- Use a reusable figure grammar for primary evidence: eyebrow/topic, figure title, short takeaway, visual area, caption, and footnote. Prefer semantic `<figure>` and `<figcaption>` when implemented as React components.
- The figure title states the analytical object, not just the chart type. Example: "5 月增长来自抖音放量，不是全平台同步改善" is better than "平台趋势".
- The takeaway should be visible near the figure and phrased as evidence, not as a decorative subtitle. It may be one sentence or a compact metric row.
- Figure captions describe how to read the visual. Footnotes describe data source, period, calculation caveats, missing evidence, or business-definition boundaries.
- Footnotes and corner notes should be visually quiet: small UI type, muted color, tabular numbers, left-aligned, and separated from the main conclusion. They must not compete with chart labels.
- Prefer direct labels, reference bands, target lines, quadrant labels, lollipop endpoints, and compact callouts over large legends and long explanatory paragraphs.
- Reference lines, threshold lines, and benchmark bands must name their source in the figure caption or footnote: industry benchmark, internal management line, or report-only observation line. Do not let visual guide lines look like undocumented facts.
- Corner notes are for source, period, caveat, and missing-evidence language only. Keep them in the lower-left or figure-footnote area, 1-3 short lines, and never use them for the main takeaway.
- Avoid chart-box repetition. A report page should feel like a designed evidence page, not a grid of generic dashboard cards.

#### Static report annotation label taxonomy

Use one authoritative layer for each label or caveat. Do not repeat the same message as a chip, subtitle, badge, corner note, and footnote.

| Layer | Job | Placement | Use for | Do not use for |
| --- | --- | --- | --- | --- |
| Page title | States the business answer or analytical object | Page header | Main claim, chapter question, decisive comparison | Source strings, caveats, decorative route metadata |
| Lead sentence | Connects the page to the route-level pyramid | Under the title, 1-2 sentences | Why this page matters, how it supports the executive answer | Long methodology, row-level proof |
| Figure takeaway | Makes the chart claim readable without hover | Near the figure title or immediately above the visual | One evidence judgment, dominant number, signed movement | Generic subtitles, source/caveat text |
| Direct data label | Lets the reader believe the mark | On or next to bars, dots, endpoints, bands, or quadrants | Values, deltas, endpoint labels, benchmark names | Paragraph explanations or every minor value |
| Caption | Teaches the reading order | Under or adjacent to the visual | Sort rule, axis meaning, comparator meaning, additive boundary | Full methodology or unresolved data gaps |
| Corner note | Adds quiet local status | Lower-left figure/page note area | Source, period, caveat, missing-evidence status in 1-3 short lines | The main takeaway, KPI highlights, promotional labels |
| Figure footnote | Defines local evidence boundaries | Inside the figure block after the caption | Unit, source, period, calculation caveat, null/missing treatment | Route-wide methodology repeated on every page |
| Page footnote | Handles caveats shared by the page | Bottom of the page or after the evidence block | Page-specific data status, row cap, omission rule | Chart-specific mark explanations |
| Methodology note | Governs the whole route | Methodology/evidence gaps section | Data source inventory, definitions, sampling, attribution, confidence limits | Main conclusions that belong in body sections |

Primary evidence must live in page title, lead sentence, figure takeaway, direct label, or caption. Corner notes, footnotes, and methodology notes are governance layers; they may qualify the claim but must not carry the claim alone.

#### Static report chart decision matrix

Choose the chart by the analytical question before choosing decoration:

| Analytical question | Preferred static-report visual | Use when | Avoid when |
| --- | --- | --- | --- |
| What changed over time? | Rounded vertical bars or annotated bar/line with reference band | Month/year trend, promotion month, current vs baseline | The story is rank or composition, not time |
| Which platform or channel plays which role? | Quadrant bubble map with direct quadrant labels | Compare scale, growth, efficiency, or risk at once | There are fewer than 3 entities or no second dimension |
| Which items drive contribution and risk together? | Paired ranked bar, lollipop, or dumbbell with risk dot | SKU contribution vs refund, spend vs ROI, sales vs margin | Exact row-level lookup is the primary task |
| Where did the delta come from? | Candidate waterfall/delta bridge; `delta-rank` for non-additive movement | Decompose GSV, spend, conversion, or refund change when inputs are additive and baselines are clear | Inputs are not additive or baselines are unclear |
| How does mix shift across categories? | Stacked bar, mosaic/tile heatmap, or small multiples | Platform/category/traffic mix comparison | Too many categories make labels unreadable |
| How do entities move between periods? | Slopegraph or connected dot plot | Ranking or share shift from one period to another | More than 10 lines or crossings hide the point |
| Which entities dominate across several years or periods? | Multi-column top-list cards | Annual Top brands/SKUs/channels, list churn, stable leaders | Exact values or continuous trends are the main question |
| Are values above or below a threshold? | Bullet chart, benchmark band, or target line | ROI, refund rate, conversion, fulfilment quality | No meaningful benchmark exists |
| Which risks need action first? | Impact x urgency matrix or quality quadrant | Priority board, action planning, resource allocation | The page needs exact metric reconciliation |

Visual style for all static-report charts:

- Keep the palette restrained: one dominant series color, muted comparators, and semantic accents only for risk, target, or platform/category identity.
- Use soft grid lines, compact axes, direct labels where possible, and whitespace around the plot. Do not fill every available pixel.
- Round bar corners lightly, keep bars slimmer than dashboard defaults, and increase spacing between ranked rows for legibility.
- Prefer modern ranked visuals over formulaic tables when the reader needs relative order, distance, or outlier detection.
- For modern bar/rank compositions, prefer sorted horizontal bars or lollipop rows, direct end labels, one muted comparator or delta marker, and generous row spacing. Avoid rainbow bars, 3D effects, dense vertical columns, and table-like label walls.
- Use annotations to mark decisive periods, thresholds, or exceptions; do not annotate every point.
- Tooltips may exist for interactive inspection, but the static page must remain understandable without hovering.
- No primary evidence may be tooltip-only. A screenshot/export reader must see the conclusion through the title, takeaway, direct labels, legend/caption, and figure footnote.
- Lazy-mounted report charts must still support browser smoke checks, screenshots, and export-like reads. Validation should prove that the actual canvas/SVG chart is mounted with non-zero dimensions, not just that an empty chart container exists.

Modern static-report chart templates:

- Ranked contribution bars: use slim horizontal bars with direct value labels, quiet axis/grid, and one muted comparator or risk marker. Prefer this over a long table when the reader needs rank, distance, and outliers.
- Lollipop: use for ranked values when label density matters. Keep stems muted, dots prominent, sort by the metric being argued, and label the top/bottom or decisive exceptions directly.
- Dumbbell / connected dot: use for two comparable endpoints such as current vs reference or before vs after. Label both endpoints and the delta; do not use it for unrelated metrics sharing one row.
- Slopegraph: candidate visual for period-to-period rank/share movement. Limit visible lines to the decisive set, label both ends directly, and avoid crossings that hide the conclusion; add gallery/catalog coverage before production use.
- Multi-column top-list cards: candidate DOM visual for annual/period Top lists when entry/exit/stability is the story. Each column needs a clear period label, 3-5 rows, compact rank markers, and one visible movement or status clue; add a static-visual catalog entry and fixture before production use.
- Paired risk bars: place contribution and refund/risk in the same figure through a secondary dot/line marker, not two equal dashboard cards. The caption must state which mark is primary.
- Delta rank: for non-additive 4 月 vs 5 月 changes, use signed ranked bars named as delta rank. Reserve "waterfall" for additive bridge logic with explicit baseline and subtotal bars.
- Benchmark band / bullet: when a reference exists, draw a soft band or target line and name the source in the caption/footnote. Bullet charts must show actual, target/reference, and acceptable band without requiring hover. If the reference is only a report observation line, say so.
- Quadrant bubble: use it only when the section asks for role or priority. Label quadrants directly; keep bubbles few, sized by an interpretable metric, and avoid decorative legends.
- Tile heatmap / compact matrix: use for dense SKU x source or platform x period evidence after a main figure. Do not use it when it merely repeats the same conclusion as the chart above. Keep labels short, use neutral labels, reserve color intensity for comparable values, and move full row reconciliation into progressive disclosure.
- Template variants must stay semantically named: `lollipop` for ranked single values, `dumbbell` for two endpoints, `delta rank` for signed changes, and `tile heatmap` for compact two-dimensional density. Do not rename these as generic bars/cards in component APIs.

Static report chart acceptance rubric:

- The figure title must state the business judgment or analytical object, not merely the chart type.
- The takeaway must be readable without hover; no primary number, caveat, label, or comparison may be tooltip-only.
- Period, unit, source, and calculation caveat must be visible in the caption, footnote, corner note, or evidence drawer summary.
- Reference lines, target lines, and benchmark bands must name their source and whether they are industry benchmarks, internal management lines, or report-only observation lines.
- Missing / null / not collected values must never be drawn as true zero; use gaps, `N/A`, an omitted mark, or an explicit missing note.
- Keep visible legend categories at 6 or fewer unless category breadth is the question; prefer direct labels over large legends.
- Long tables are secondary evidence. If a table becomes the dominant object, replace the main read with a ranked visual, tile heatmap, bullet, quadrant, or composition chart first.
- At 390px mobile width, the chart block must not create horizontal page overflow; dense matrices should stack or move full rows into progressive disclosure.
- Print/export mode must force lazy charts to mount and avoid clipped canvas/SVG output.
- Every new visual template must have a catalog entry before the local implementation uses it.

Static report scoring rubric for delivery review:

| Dimension | Points | Passing evidence |
| --- | ---: | --- |
| Report cognition / pyramid | 20 | The route reads answer-first: report question, executive answer, 3-5 supporting arguments, visual proof, then action or open question. |
| Chart evidence system | 20 | Each major section has one dominant figure with visible title, takeaway, caption, direct labels, and an evidence destination for exact rows. |
| Evidence governance / caveat | 15 | Source, period, unit, row cap, omission rule, missing-value treatment, and unresolved evidence gaps are visible without reading source code. |
| Reader fatigue / rhythm | 15 | A page keeps to one question, no more than one secondary evidence table, compact prose width, quiet footnotes, and no long table as the main read. |
| Responsive / export behavior | 10 | Desktop/tablet/mobile have no page-level horizontal overflow; 390px uses stacked cards or concise row groups; export/print forces lazy charts to render. |
| Maintainability / file boundaries | 10 | Content, chart options, report shell, evidence drawer, domain visuals, and CSS Modules stay in their documented ownership boundaries. |
| Performance | 5 | Static snapshots avoid live API fan-out, chart options are built outside hot render loops, and no unneeded chart/runtime dependency is introduced. |
| Validation automation | 5 | Smoke/type/build/browser gates cover catalog, chart mount, row caps, mobile overflow, and retired labels before delivery is called complete. |

Common scoring deductions:

- Tooltip-only primary evidence: -5.
- Long table or matrix repeats the same conclusion already expressed by the primary figure: -5.
- Long table used as the dominant section object when a ranked visual, heatmap, bullet, quadrant, or composition chart would answer the question: -5.
- Primary DOM visual missing from `SPECIAL_REPORT_STATIC_VISUAL_CATALOG`, chart gallery fixture, or smoke expectation: -3 per visual.
- 390px page-level horizontal overflow: P0 blocker / -10.
- Missing, filtered, or not-collected value drawn as true zero: P0 blocker / -10.
- Figure lacks source, period, calculation caveat, or missing-evidence note: -3.
- Snapshot/content payload grows without a generator, split boundary, or documented ownership reason: -2 to -5.

Value semantics for static-report charts:

- Missing, not collected, not applicable, and filtered-out values must not be drawn as true zero. Use a gap, omit the mark, or show a quiet `N/A` / "not comparable" note in the figure footnote.
- True zero means the entity existed in scope and the measured activity was exactly zero. It may sit on the baseline, but it must be distinguishable from missing through label, legend, or footnote language.
- Extremely small non-zero values should stay visually present or be labeled with a threshold such as `<0.1%` / `<1`. Do not round them into `0` when that changes the business meaning.
- Any imputed, clipped, capped, or normalized value must be named in the caption or figure footnote before it is used for comparison.

#### Static report table and footnote hierarchy

- Tables are secondary evidence by default. Use them for auditability, exact values, or row-level reconciliation after the chart has answered the question.
- Table titles should explain why the table exists, such as "复核：TOP SKU 贡献与退款明细", not generic labels such as "查看明细表".
- Keep visible tables compact: prioritize the 5-8 rows that support the conclusion. Put full lists into progressive disclosure or a later evidence appendix only when needed.
- Long tables are evidence appendices, not primary sections. Place them after the decisive figure or behind disclosure, lead with sort key, count, period, and omission rule, and never use table length to compensate for a missing visual conclusion.
- Visual tables are table-like evidence unless they are cataloged as an approved static visual with one explicit business question, visible claim, row/column cap, mobile policy, and evidence destination. Use a visual table only for independent reading tasks such as dense scan, ranking, gap diagnosis, source coverage, audit reconciliation, or action ownership; never use it as a decorated duplicate of the main chart.
- Table-first is an explicit exception, not a fallback for missing chart design. The route must document why a chart cannot answer the question, how rows are capped/sorted, what is omitted, and where full export or reconciliation lives.
- Numeric table columns must use tabular numbers, consistent units, and muted secondary values. Do not create multi-line numeric cells unless a primary/secondary hierarchy is clear.
- Page-level footnotes sit after the evidence block or in the lower-left corner area of the section. Figure-level footnotes sit inside the figure. Methodology notes that affect multiple pages belong in the methodology section.
- Annotation hierarchy is direct label -> caption -> figure footnote/corner note -> page footnote -> methodology section. Put each caveat in one authoritative layer; do not repeat the same source/caveat as a badge, subtitle, and footnote.
- Move caveats, source definitions, data gaps, and calculation boundaries out of section subtitles and into footnotes unless they are part of the conclusion itself.

### DataOps / Ops Pages

- Primary job: operational diagnosis, status, logs, and safe actions.
- Use compact tables, status badges, timestamps, run IDs, traceable errors, and explicit retry/action affordances.
- Prefer high information density with restrained borders; avoid ornamental charts or decorative cards.

### Admin Pages

- Primary job: configuration, permissions, audit, and irreversible action control.
- Use utility-first tables/forms, clear destructive states, and explicit confirmation affordances.
- Avoid chart styling, marketing copy, and page-specific type scales.

### Home / Marketing Shells

- Primary job: orientation and entry-point clarity.
- May use wider spacing, stronger visual hierarchy, and more editorial composition.
- Still reuse the same typography, tokens, navigation grammar, and one-brand-accent rule.

### Marketing Intelligence / Industry News Pages

- Primary job: monitor marketing industry articles, sources, freshness, and downstream content decisions without turning the page into a media portal.
- Treat industry-news pages as a workbench: overview metrics, filters, feed list, source ranking, and article drawer must remain scannable and operational.
- Visual grammar stays inside AIOS's white/gray/blue authority: neutral surfaces, tokenized brand-blue emphasis, low-noise borders, and mono/tabular numbers for counts, recency, and rankings.
- Route-level CSS Modules for marketing intelligence may use editorial spacing slightly more generous than dashboards, but must keep dense list reading efficient and avoid decorative gradients, oversized cards, or non-token local colors.
- New article/source states must cover loading, empty, stale/error, and selected-detail states with restrained status colors; do not encode source identity with arbitrary brand palettes unless promoted into a documented domain taxonomy.

### Marketing Content Asset Pages

- Primary job: manage short-video/source-material assets from upload/import through profiling, AI analysis, platform video mapping, ad-material mapping, and reusable identity enrichment.
- Treat content-asset pages as an operational media workbench, not a consumer video feed: the main list must keep file status, usage coverage, and next action readable before decorative media treatment.
- Asset cards may include cover imagery and inline video preview, but playback controls must stay quiet and task-oriented: single-layer play affordance, visible loading/error state, default muted playback, and an explicit mute/unmute control when media is active.
- Card media interactions must not conflict with route navigation. Play, mute, download, and detail actions require distinct hit targets, visible focus states, and event boundaries so users can preview without accidentally opening the detail route.
- Detail pages should reuse the same white/gray/blue console language as the list page, with profile, transcript, AI analysis, platform mapping, and ad-material mapping grouped by workflow state rather than campaign-style storytelling.
- Content asset module labels, queue counts, media duration, file sizes, and platform IDs should use tabular/mono treatment where numeric scanning matters; free-text transcript and AI summaries stay in normal UI typography for readability.

### Content Hub / Live Center Pages

- Primary job: organize content operations under the top-level 内容中台 navigation while keeping 素材库 and 直播中台 as focused secondary workbench entries.
- The content hub navigation grammar should stay one-language: the active top-level item may use the global blue pill treatment, while nested entry icons remain unframed unless the control itself is an explicit button. Do not stack an icon box inside an active navigation pill.
- Live center pages are operational review workbenches: lead with the session queue, review status, source metadata, and next action rather than a marketing-style hero or decorative media wall.
- Live center session queues default to Groland self-broadcast scope; do not mix other anchors or 达播 sessions into the primary review queue.
- Live-session review surfaces should group preview, script/transcript, platform IDs, evidence, and action controls by workflow state. Use compact white/gray/blue cards, tokenized borders/shadows, visible focus states, and tabular/mono treatment for counts, IDs, timestamps, and durations.
- Live-session recording review uses one evidence workspace instead of a left/right split: before upload, show a single upload-recorder prompt; after upload, replace that prompt with an embedded recording player, recording metadata, and the AI analysis action/status in the same panel.
- AI analysis result access should stay task-oriented: the primary action creates or resumes analysis, completed analysis links to its result route, and analysis status/errors remain adjacent to the recording evidence rather than in a detached side panel.
- Minute-level成交趋势 is supporting evidence for locating playback moments. Keep it below the recording/AI workspace so the top of the review page is reserved for upload, playback, and analysis decisions.
- Live center shell styles may be split into `live-center-shell.module.css` when the route moves to an immersive workbench layout. Keep the shell responsible for viewport, topbar, queue rail, and scroll-region geometry; keep evidence cards, tables, recording, minute trend, and analysis modules in the existing route/component styles.
- Route-level CSS Modules under `apps/web-vite/src/app/content/**` may define local material aliases for the live center shell, session list, and review workspace, but they must map back to AIOS neutral/blue tokens. Oversized route modules are frozen debt and should be split by shell, list, and workspace responsibility before growing.

## Design Authority & Evolution

- Normal frontend work uses `DESIGN.md` in enforce mode: pages, components, CSS Modules, charts, and interactions must prefer the current tokens/contracts before generic taste-skill advice.
- Design-evolution mode is reserved for redesign, new route/page shells, brand-language upgrades, high-motion direction changes, and cross-page visual system changes.
- In design-evolution mode, implementation may intentionally move beyond the current baseline only when the same change set updates this `DESIGN.md` and any affected token or component contract source.
- New route pages and route-level CSS Modules under `apps/web-vite/src/app/` are treated as design-evolution candidates. Private leaf component changes under route `_components` stay in normal component scope unless the route plan explicitly enters design-evolution mode.
- The executable guard is `npm run verify:frontend:design-evolution`; the paired behavior fixture is `npm run verify:frontend:design-evolution-behavior`.
- If the guard fails, do not bypass it by weakening route classification. Either update this authority document to describe the new visual grammar, or keep the implementation inside the current design contracts.

## Typography System

- AIOS uses a three-layer font system: UI, Display, and Mono/Data. Do not introduce page-only font families without adding a documented role here.
- UI font for Chinese UI, dense dashboards, tables, filters, buttons, forms, menus, and ordinary CJK/Latin mixed text:
  `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif`.
- Display font for product names, English brand lockups, homepage hero titles, and short Latin headings:
  `"Geist", "Avenir Next", "SF Pro Display", "Segoe UI", system-ui, sans-serif`.
- Mono/data font for KPI values, currency, percentages, IDs, timestamps, SQL, logs, run IDs, trace IDs, and code-like data:
  `"Maple Mono", "SF Mono", "JetBrains Mono", "Roboto Mono", "Cascadia Code", Consolas, monospace`.
- Maple Mono is preferred for data/code when self-hosted. Do not use Maple Mono or Maple Mono CN as the global UI font, and do not use Nerd Font glyphs as product UI icons.
- Runtime enforcement: CSS Modules must consume font families through `var(--font-family-base)`, `var(--font-family-display)`, `var(--font-family-mono)`, or `inherit`. Do not paste local stacks such as `"Geist Mono", ...` or `"Courier New", monospace` into page-level CSS.
- Runtime enforcement: CSS Modules must not introduce new raw `font-size`, `line-height`, or `letter-spacing` values. Existing legacy raw declarations are frozen in `scripts/css-module-typography-allowlist.json`; new and refactored declarations should use `--font-size-*`, `--line-height-*`, and `--letter-spacing-*` tokens.
- Letter spacing tokens: `--letter-spacing-normal` for ordinary UI text, `--letter-spacing-label` for short uppercase KPI/metadata labels, `--letter-spacing-eyebrow` for rare English eyebrow/kicker labels, `--letter-spacing-tight` for page titles, `--letter-spacing-title` for section titles, and `--letter-spacing-data` for mono/tabular KPI values.
- Line-height tokens: `--line-height-none` for large single-line numbers, `--line-height-zero` only for structural collapse rows such as AntD measure rows, `--line-height-compact` for dense chart labels, `--line-height-snug` for badges/meta labels, `--line-height-tight` for compact headings, `--line-height-normal` for ordinary UI, `--line-height-relaxed` for paragraphs, and `--line-height-prose` for long markdown/reference-document reading.
- Control geometry line-height tokens: use `--component-control-line-height-xs|sm|md|lg` only when a third-party control needs fixed pixel line-height for vertical centering inside a fixed-height Pagination, Select, icon expand control, or small action button. Do not use these tokens for prose, labels, KPI values, or ordinary text rhythm.
- Runtime enforcement: CSS Modules must stay focused. New `*.module.css` files should stay under 800 lines; existing oversized legacy modules are frozen in `scripts/css-module-size-allowlist.json` and may not grow. Split by page section, component, or domain concern before adding more styles to those files.

### Type Scale Contract

Use this scale before inventing a page-local size. Dashboard pages should rarely exceed the page-title and data-large sizes; home/marketing shells may use the marketing display sizes only for first-screen orientation.

| Role | Size | Weight | Line height | Tracking | Font | Runtime / Tailwind / component mapping | Usage |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Tiny label | 11px | 520 | 1.25 | 0 | UI | `--font-size-xs`, `text-xs`, `Typography caption` | badges, axis labels, dense table hints |
| Label/meta | 12px | 520 | 1.35 | 0 or `--letter-spacing-label` for short uppercase labels | UI | `--font-size-sm`, `text-sm` | metadata, helper text, table hints, compact filters |
| Body / table base | 14px | 400 | 1.55 | 0 | UI | `--font-size-base`, `text-base`, `Typography body1` | normal UI copy, table cells, form text |
| Small section text | 16px | 560-640 | 1.35-1.5 | 0 to -0.01em | UI | `--font-size-lg`, `text-lg`, `Typography h3/h4` | card/module titles, panel subheads, important labels |
| Card emphasis / data small | 18px | 620 | 1.15 | -0.01em | UI or Mono/Data | `--font-size-xl`, `text-xl`, `--font-size-data-sm`, `Typography data-sm` | small KPI values, compact score values |
| Section title | 20px | 660 | 1.25 | -0.02em | UI | `--font-size-section-title`, `text-section-title`, `Typography h2` | page sections and major module groups |
| Data medium / subpage heading | 24px | 650-660 | 1.08-1.2 | -0.02em to -0.035em | UI or Mono/Data | `--font-size-2xl`, `text-2xl`, `--font-size-data-md`, `Typography data-md` | medium KPI values, secondary page headings |
| Page title | 30px | 680 | 1.18 | -0.03em | UI or Display | `--font-size-display`, `text-display`, `Typography h1` | primary page heading only |
| Data large | 32px | 660 | 1.05-1.2 | -0.035em | Mono/Data | `--font-size-data-lg`, `text-data-lg`, `Typography data-lg` | hero KPI values and primary dashboard numbers |
| Marketing display large | 40px | 680-700 | 1.05-1.15 | -0.04em | Display | `--font-size-marketing-lg`, `text-5xl` only in home/marketing shells | homepage hero title on desktop |
| Marketing display max | 48px | 680-700 | 1.0-1.12 | -0.045em | Display | `--font-size-marketing-xl`, `text-6xl` only in home/marketing shells | rare first-screen English/product headline |

- Domain taxonomy label: 11-12px, weight 560-620, line-height 1.25, UI font, `--letter-spacing-normal` by default and `--letter-spacing-label` only when the label text is short. Use for traffic levels, TOPSIS quadrants, funnel stages, creator levels, and cooperation stages.
- English brand word / compact product lockup: Display font, weight 680-720, line-height 1, letter-spacing -0.055em, lowercase when appropriate. Desired feel: DeepSeek-like rounded geometric lowercase, compact spacing, calm weight, and no neon SaaS personality.
- Hero English title: Display font, weight 680-700, line-height 0.98-1.08, letter-spacing -0.045em to -0.025em.
- KPI/data large: 32px, weight 660, line-height 1.05, mono font, tabular numbers, letter-spacing -0.035em.
- KPI/data medium: 24px, weight 650, line-height 1.08, mono font, tabular numbers.
- KPI/data small: 18px, weight 620, line-height 1.15, mono font, tabular numbers.
- Tables and chart labels must use tabular numbers for all currency, percent, count, and date-like numeric values.
- Avoid bold inflation. Increase hierarchy with whitespace, text color level, and mono/tabular number treatment before increasing font size.
- Do not use `text-4xl`, `text-5xl`, or `text-6xl` inside dashboards, reports, DataOps, or admin pages unless the role is explicitly promoted into this scale first.
- Banned typography patterns: random per-page font sizes, pure black text, over-bold body text, huge marketing H1s inside dashboards, all-monospace Chinese UI, and inconsistent numeric fonts.

#### Dashboard dense detail table contract

Use this compact table grammar for operational evidence tables that are designed
for dense scanning, such as creator short-video detail tables and industry
material inspiration detail tables. This is a dashboard-specific detail-table
variant; do not invert it into 12px headers with 14px body cells.

| Element | Runtime tokens | Alignment / usage |
| --- | --- | --- |
| Header cells | `--component-table-detail-header-font-size` = 14px, `--component-table-detail-header-font-weight` = 620, `--component-table-detail-header-line-height`, `--component-table-detail-header-letter-spacing` | centered, `--text-secondary`, quiet structural anchor |
| Body cells | `--component-table-detail-body-font-size` = 12px, `--component-table-detail-body-font-weight` = 410, `--component-table-detail-body-line-height` | `--text-secondary`, compact row scanning |
| Cell links | `--component-table-detail-link-font-weight` = body weight / 410 | blue only when clickable; no extra weight by default |
| Numeric detail cells | `var(--font-family-mono)`, `--component-table-detail-numeric-letter-spacing` | tabular numbers; right-align comparative metrics, center rank/range values when that column reads as an identity/range |

Non-numeric dense detail cells should be centered by default. Primary title/link
cells may be left-aligned when the user needs to read the full title quickly;
keep them single-line with ellipsis in wide evidence tables.

## Color Palette

- Brand Canvas `#F5F5F5`: global page background and brand light-gray whitespace.
- Surface White `#FFFFFF`: cards, table containers, popovers, drawers, and primary content surfaces.
- Hover Wash `#FAFAFA`: quiet hover and selected table row wash.
- Subtle Surface `#F8F8F8`: secondary panels and non-interactive soft sections.
- Text Primary / Matte Black `#1A1A1A`: titles, core values, logo-adjacent text; never use `#000000` for normal UI text.
- Text Secondary `#5F6368`: body, descriptions, table secondary content.
- Text Tertiary `#8A8F8A`: metadata, axis labels, muted hints, units, and helper text.
- Text Disabled `#B8B8B8`: disabled UI only.
- Text Inverse `#FFFFFF`: text on dark tooltip surfaces, saturated status/danger fills, or blue primary fills.
- Border `#E6E6E6`: component borders and structural 1px lines.
- Divider `#F0F0F0`: chart grid, section dividers, subtle separators.
- Hover Border `#D6DAD6`: hover border and low-noise focus-adjacent outline.
- Brand Blue `#2F6EEA`: primary action fill, active navigation pill, selected state fill, hero accent, and brand emphasis. It should feel modern, clear, and low-pressure.
- Brand Blue Hover `#255FD9`: hover fill for primary interactive surfaces.
- Brand Blue Active `#1F4FBF`: pressed state and strong active blue text.
- Brand Blue Text `#2457C5`: links, active text on white, small icons, inline emphasis, and high-legibility blue labels.
- Brand Bright Blue `#75B1F8`: gradient endpoint, small highlight, and decorative accent only. Do not use bright blue for normal 12-14px text.
- Brand Blue Soft `#F2F6FF`: subtle selected backgrounds and brand/info panels.
- Brand Blue Border `#C9D8FF`: brand soft borders.
- Brand On Primary `#FFFFFF`: required text color on `#2F6EEA` filled surfaces.
- Trend Up `#BF3D2F`: business growth / upward change in Chinese commerce dashboards.
- Trend Down `#2F8C5B`: business decline / downward change in Chinese commerce dashboards.
- Trend Neutral `#8A8F8A`: unchanged or unavailable deltas.
- Success `#168A3A`: success state, completed status, healthy runtime.
- Danger `#C93A32`: error, failure, destructive state.
- Warning `#B87503`: warning and attention state with AA contrast.
- Info `#2457C5`: informational emphasis should use the accessible brand blue text unless the chart/domain context requires a separate palette.
- Status soft backgrounds and borders must use semantic pairs from `apps/web-vite/src/styles/design-tokens.css`: success `#EAF8EE/#BFE8CA`, warning `#FFF7E6/#F3D38D`, danger `#FFF1F0/#F2C4C0`, info `#F2F6FF/#C9D8FF`, neutral `#F5F5F5/#E6E6E6`.
- Chart series colors are defined in the Chart Series Palette below. Do not use status colors, trend colors, or platform colors for ordinary bar/line series.
- Platform legend colors are category/brand exceptions for platform charts only: Tmall `#EC5E2A`, Douyin `#000000`, Xiaohongshu `#FF2442` (RGB 255, 36, 66), Kuaishou `#FF3C21`, JD `#DA291C` (Pantone 485 C sRGB approximation), WeChat `#07C160`, unknown `#8A8F8A`.
- Douyin `#000000` is allowed only as a platform brand legend/marker color. It remains banned for normal text, surfaces, borders, shadows, and non-brand UI states.
- DeepSeek-like dark console colors are reference-only for future optional dark theme: charcoal `#111112`, sidebar `#1D1D1F`, active surface `#343436`, axis line `#3C3C3C`, chart amber `#FFDC0A`.
- Banned color patterns: neon purple/blue gradients, pure black outside the Douyin platform legend exception, saturated rainbow palettes for normal dashboards, legacy SaaS-blue as a second primary accent, and arbitrary local hex values when an existing token fits.

## Text Color System

- Neutral text is the default. Most UI should use `--text-primary`, `--text-secondary`, or `--text-tertiary`; color should not compete with data.
- Primary text `#1A1A1A`: page titles, card/module titles, core values, important table text.
- Secondary text `#5F6368`: body copy, normal labels, descriptions, normal table text.
- Tertiary text `#8A8F8A`: metadata, helper text, units, chart axis labels, low-priority hints.
- Disabled text `#B8B8B8`: disabled controls only.
- Inverse text `#FFFFFF`: dark tooltip surfaces, saturated status/danger fills, and brand-filled buttons.
- Brand text `#2457C5`: links, active text on white, selected tabs, small icons, and focus-adjacent affordances only.
- Status strong text: use `--status-*-strong` only for system/workflow feedback. Pair with the matching soft background and border.
- Trend text: use `--trend-up`, `--trend-down`, and `--trend-neutral` only for business deltas.
- Platform colors are chart/category identity only. They are not ordinary text colors.
- Recommended visual ratio: 85% neutral text, 10% brand blue, 3% trend colors, 2% status/platform/domain accents.

## Brand Blue Semantics

- Brand blue is for brand/action: CTA, active nav, selected state, links, focus, and brand emphasis.
- Primary blue fill `#2F6EEA` is for larger filled surfaces. Text on it must be `#FFFFFF`.
- Blue text `#2457C5` is for readable brand text on white or very light backgrounds.
- Bright blue `#75B1F8` is a small-surface accent or gradient endpoint only. It should not be used for normal 12-14px text.
- Success green is for system success only; it is not the brand color.
- Trend-down green is for business downward movement only; it is not success and not brand.
- WeChat green is platform identity only.
- If a green appears in a chart or badge, the implementation must name which green role it is using: success, trend, platform, or domain taxonomy.

## Chart Series Palette

Use chart series colors only for ordinary bar/line multi-series comparison when the series do not already have platform, trend, status, or business-domain semantics.

| Role | Color | Usage |
| --- | ---: | --- |
| Series 1 | `#445DF6` | Deep blue primary metric, current period, main bar, and dominant legend marker |
| Series 2 | `#75B1F8` | Light blue secondary metric or comparison series |
| Series 3 | `#3264F6` | Line-chart primary stroke, point emphasis, or high-contrast blue support |
| Series 4 | `#4F8CB5` | Cool blue-cyan support metric |
| Series 5 | `#536F86` | Calm gray-blue auxiliary metric |
| Series 6 | `#A4772A` | Warm value/efficiency support |
| Muted | `#8A8F8A` | Previous period, benchmark, average, unavailable |
| Highlight | `#3264F6` | Selected line point/bar or hover highlight only |

- Legend text stays neutral (`--text-secondary`). Only legend markers/line swatches use series colors.
- Single-metric bar charts use Series 1. Single-metric line charts may use Series 3 for the line/point if the chart affordance needs stronger cobalt. Do not assign different colors to every bar unless each bar represents a real semantic category.
- Current vs previous period: current uses Series 1 `#445DF6`; previous uses Muted `#8A8F8A`, dashed for lines or low-opacity for bars.
- Target or benchmark lines use muted neutral gray or matte black dashed lines, not saturated colors.
- For platform charts use platform colors; for trend/waterfall charts use trend colors; for status distribution use status colors; for business taxonomy use the domain taxonomy palettes below.

## Domain Taxonomy Color System

Domain taxonomy colors encode business categories. They are not status, trend, platform, or action colors. Use them for chips, chart markers, category rows, and category-specific chart fills only.

### Domain Typography Contract

- Taxonomy chip label: UI font, 11-12px, weight 560-620, line-height 1.25, compact padding, radius 999px or 6-8px depending on density.
- Taxonomy row title: UI font, 13-14px, weight 560-620, `--text-primary` unless the row is represented as a chip.
- Taxonomy numeric value: Mono/data font, tabular numbers, `--text-primary`; do not color numeric values with taxonomy colors unless the number is inside a small colored badge.
- Taxonomy helper/meta: 11-12px, `--text-tertiary`.
- In charts, taxonomy color applies to marker/bar/line/pie slice; labels remain neutral.

### Domain Implementation Naming

Use canonical domain keys when adding constants, CSS variables, chart configs, or TypeScript maps. Do not invent local names such as `redTag`, `levelColor`, `goodColor`, or `stageBg`.

| Domain | Canonical keys | Token shape |
| --- | --- | --- |
| Traffic hierarchy | `traffic.summary`, `traffic.l1`, `traffic.l2`, `traffic.l3` | `accent`, `text`, `bg`, `border` |
| Goods TOPSIS | `topsis.star`, `topsis.stable`, `topsis.opportunity`, `topsis.longTail`, `topsis.neutral` | `text`, `bg`, `border` |
| Funnel stages | `funnel.track`, `funnel.exposure`, `funnel.visit`, `funnel.intent`, `funnel.conversion`, `funnel.connector` | `color`, `bg`, `textOnFill` |
| Creator levels | `creator.s`, `creator.a`, `creator.b`, `creator.c`, `creator.d` | `from`, `to`, `bg`, `text` |
| Cooperation stages | `cooperation.unclassified`, `cooperation.initialContact`, `cooperation.sampleNegotiation`, `cooperation.notConsidering`, `cooperation.paused`, `cooperation.liveStarted` | `text`, `bg` |

- CSS variable naming should follow `--domain-<domain>-<key>-<role>`, for example `--domain-traffic-l1-text`, `--domain-topsis-star-bg`, `--domain-creator-s-from`.
- TypeScript maps should expose the same semantic key path, for example `DOMAIN_TAXONOMY_COLORS.traffic.l1.text`.
- ECharts option builders should receive semantic keys and resolve colors centrally; avoid hardcoded hex strings inside tooltip/series formatter logic.

### Traffic Hierarchy Palette

| Traffic role | Accent | Text | Soft bg | Border | Usage |
| --- | ---: | ---: | ---: | ---: | --- |
| Summary | `#8795AA` | `#3F5067` | `#F1F5FB` | `#A6B4C7` | 汇总行、总览 badge |
| L1 | `#445DF6` | `#243CB5` | `#F2F5FF` | `#B8C4FF` | 一级来源/渠道，最强层级 |
| L2 | `#2F6EEA` | `#2457C5` | `#F2F6FF` | `#C9D8FF` | 二级来源/渠道，中间层级 |
| L3 | `#75B1F8` | `#2F6EA8` | `#F4FAFF` | `#CDE6FE` | 三级来源/渠道，最轻层级 |

- L1/L2/L3 are business hierarchy levels, not warning/info/success states.
- Do not remap L1 to warning, L2 to info, or L3 to success.
- Default three-level traffic hierarchy runs deep-to-light: `#445DF6 -> #2F6EEA -> #75B1F8`.
- If a four-level hierarchy is needed in a future table/chart, insert cobalt `#3264F6` between L1 and L2: `#445DF6 -> #3264F6 -> #2F6EEA -> #75B1F8`.
- In traffic tables, hierarchy color may tint the first cell, badge, left accent line, or row hover. Regular cell text stays neutral.

### Goods TOPSIS Quadrant Palette

| Quadrant | Text | Soft bg | Border | Usage |
| --- | ---: | ---: | ---: | --- |
| Star / 明星 | `#BF3D2F` | `#FFF1EF` | `#F2C4C0` | 高综合评分、高优先级商品象限，沿用上涨红 |
| Stable / 稳定 | `#2457C5` | `#F2F6FF` | `#C9D8FF` | 稳定贡献、持续经营商品象限 |
| Opportunity / 机会 | `#2F6F9F` | `#EAF3FA` | `#BFD5E5` | 有提升空间或潜力商品象限 |
| Long Tail / 低效尾部 | `#2F8C5B` | `#ECF8F1` | `#BFE8CA` | 低效尾部、低频、观察商品象限，沿用下跌绿 |
| Neutral / 未分类 | `#8A8F8A` | `#FAFAFA` | `#E6E6E6` | 缺失、未知、默认分类 |

- TOPSIS quadrant colors are ranking/category semantics. Star and Long Tail intentionally mirror trend-up red and trend-down green for commerce readability, but they remain quadrant colors rather than generic trend labels.
- Scores and rankings use neutral or mono typography first; quadrant colors should appear as chip, dot, border, or subtle background.
- Do not extend trend colors to Stable or Opportunity. Trend colors remain reserved for deltas outside the Star / Long Tail quadrant convention above.

### Funnel Stage Palette

| Funnel role | Color | Soft bg / track | Text on fill | Usage |
| --- | ---: | ---: | ---: | --- |
| Track | `#C9D8FF` | `#F2F6FF` | N/A | funnel background track |
| Stage 1 / Exposure | `#7EA1F7` | `#F2F6FF` | `#FFFFFF` | exposure/top-of-funnel |
| Stage 2 / Click or Visit | `#5D86F1` | `#EFF4FF` | `#FFFFFF` | click, visit, enter |
| Stage 3 / Intent | `#4476ED` | `#E8F0FF` | `#FFFFFF` | cart, favorite, consult, intent |
| Stage 4 / Conversion | `#2F6EEA` | `#F5F8FF` | `#FFFFFF` | pay/conversion endpoint |
| Connector | `#D7DEE0` | N/A | N/A | funnel connector and guide lines |

- Funnel stages are sequential flow semantics. The blue ramp belongs to funnel geometry, not info/status color.
- Use brand blue only at the conversion endpoint or hover/selected bar, not for normal text outside the funnel graphic.
- Funnel side labels and percentages should stay neutral unless rendered inside a filled funnel bar.

### Creator Level Palette

| Creator level | Gradient from | Gradient to | Chip bg | Text | Usage |
| --- | ---: | ---: | ---: | ---: | --- |
| S | `#1F4FBF` | `#445DF6` | `#D6E0FF` | `#1F4FBF` | top-tier creator level |
| A | `#3264F6` | `#5D86F1` | `#DDE7FF` | `#243CB5` | strong creator level |
| B | `#2F6EEA` | `#75B1F8` | `#E5EEFF` | `#2457C5` | mid creator level |
| C | `#75B1F8` | `#CDE6FE` | `#EAF7FF` | `#2F6EA8` | developing creator level |
| D | `#C9D8FF` | `#F2F6FF` | `#F0F5FF` | `#536F86` | entry/long-tail creator level |

- Creator levels are rank taxonomy, not status health.
- Creator level color must run deep-to-light by rank, following the AIOS blue hierarchy instead of mixed status colors.
- Use gradients for level distribution bars or radial marks. Use filled chip bg + text for table and form chips; visual borders should stay transparent.
- Detail table text remains neutral; only the level chip/marker carries the level color.

### Cooperation Stage Palette

| Cooperation stage | Text | Chip bg | Usage |
| --- | ---: | ---: | --- |
| Unclassified / `-` | `#5F6368` | `#EFEFEF` | unknown/default |
| Initial contact / 初期建联 | `#2457C5` | `#E4ECFF` | first contact |
| Sample negotiation / 试样洽谈 | `#8F5E02` | `#FFF0C7` | sample or negotiation |
| Not considering / 暂不考虑合作 | `#A65F3E` | `#FFE4DD` | rejected/not considering |
| Paused / 合作暂停 | `#9F3D35` | `#FFE1DE` | paused workflow |
| Live started / 已合作开播 | `#0F6F2E` | `#DFF5E7` | completed cooperation workflow |

- Cooperation stages are creator workflow taxonomy. They may resemble status colors but are scoped to cooperation workflow only.
- Use stage colors for flow nodes, filled stage chips, filter chips, and stage-specific chart segments.
- Do not use these colors for generic success/error/warning UI outside cooperation workflows.

## Runtime Token Mapping

| Role | CSS variable | Tailwind / utility | Ant Design | ECharts / code |
| --- | --- | --- | --- | --- |
| Primary action fill | `--brand-primary` | `bg-brand-primary` | `colorPrimary` | selected/highlight fill only |
| Brand text on light | `--brand-text` | `text-brand-text` | `colorLink` | links, selected tab text, small icons |
| Text on brand fill | `--brand-on-primary` | `text-brand-on-primary` | primary button text | required on `#2F6EEA` filled surfaces |
| Primary text | `--text-primary` | `text-text-primary` | text token mapping | headings, primary labels |
| Secondary text | `--text-secondary` | `text-text-secondary` | text token mapping | axis/body labels |
| Tertiary text | `--text-tertiary` | `text-text-tertiary` | text token mapping | helper text, metadata |
| Border | `--border-color` | `border-border-color` | `colorBorder` | grid/axis line |
| Divider | `--divider-color` | `border-divider-color` | divider mapping | chart split line |
| Chart series 1 | `--chart-series-1` | N/A | N/A | ordinary primary metric series |
| Chart series 2-6 | `--chart-series-*` | N/A | N/A | ordinary multi-series charts |
| Chart muted | `--chart-series-muted` | N/A | N/A | previous period / benchmark |
| Chart highlight | `--chart-series-highlight` | N/A | N/A | selected / hover point or bar only |
| Success status | `--status-success` | `.status-badge-success`, `.status-panel-success` | `colorSuccess` | status only |
| Warning status | `--status-warning` | `.status-badge-warning`, `.status-panel-warning` | `colorWarning` | status only |
| Danger status | `--status-danger` | `.status-badge-danger`, `.status-panel-danger` | `colorError` | error/destructive only |
| Info status | `--status-info` | `.status-badge-info`, `.status-panel-info` | `colorInfo` | info only |
| Neutral status | `--status-neutral` | `.status-badge-neutral`, `.status-panel-neutral` | local mapping | empty/muted state |
| Trend up | `--trend-up` | `text-trend-up` | N/A | business upward delta |
| Trend down | `--trend-down` | `text-trend-down` | N/A | business downward delta |
| Trend neutral | `--trend-neutral` | `text-trend-neutral` | N/A | unchanged/missing delta |
| Tmall legend | `--platform-tmall` | `text-platform-tmall` | N/A | `apps/web-vite/src/lib/platform-colors.ts` |
| Douyin legend | `--platform-douyin` | `text-platform-douyin` | N/A | `apps/web-vite/src/lib/platform-colors.ts` |
| Xiaohongshu legend | `--platform-xiaohongshu` | `text-platform-xiaohongshu` | N/A | `apps/web-vite/src/lib/platform-colors.ts` |
| Kuaishou legend | `--platform-kuaishou` | `text-platform-kuaishou` | N/A | `apps/web-vite/src/lib/platform-colors.ts` |
| JD legend | `--platform-jd` | `text-platform-jd` | N/A | `apps/web-vite/src/lib/platform-colors.ts` |
| WeChat legend | `--platform-wechat` | `text-platform-wechat` | N/A | `apps/web-vite/src/lib/platform-colors.ts` |
| Unknown platform legend | `--platform-unknown` | `text-platform-unknown` | N/A | fallback platform marker via `apps/web-vite/src/lib/platform-colors.ts` |
| Domain taxonomy | `--domain-*` | `.domain-chip-*`, CSS Modules | N/A | `apps/web-vite/src/lib/domain-taxonomy-colors.ts` |
| Material layer | local `--*-material-*` | CSS Modules only | N/A | dashboard/creator module aliases |

When adding a new design role, update the runtime mapping first. A color or type rule is not considered part of the design system until it has a semantic role, a token, and an implementation path.

ECharts CSS fallback variables are adapter-level mirrors, not new roles: `--echarts-fallback-chart-series-*` mirrors `--chart-series-*`, `--echarts-fallback-platform-*` mirrors `--platform-*`, `--echarts-fallback-text-inverse` mirrors `--text-inverse`, `--echarts-fallback-divider` mirrors `--divider-color`, and tooltip fallback materials derive from `--text-primary` opacity.

## Data Display Semantics

- Currency values use CNY by default. Use tabular/mono numbers, keep the currency symbol visually close to the number, and avoid mixing font families inside one value group.
- Percentages use a consistent precision per chart/table context. Avoid mixing integer percentages with one-decimal percentages inside the same metric group unless the data source requires it.
- Counts use grouped digits for large values and never use fake rounded placeholders in production UI.
- Dates and timestamps should remain compact in tables and logs; use muted secondary text for timezone or freshness hints.
- Positive business deltas must show an explicit `+` sign. Negative deltas keep the `-` sign. Missing, unavailable, or divide-by-zero deltas render as neutral muted text.
- Red/green trend semantics in AIOS are directional, not moral: `--trend-up` means business upward movement, `--trend-down` means business downward movement. Do not map trend colors to system success/failure.
- Status semantics are system or workflow state only: healthy, completed, warning, error, disabled, pending, or informational.
- Platform semantics are category identity only: Tmall, Douyin, Xiaohongshu, JD, WeChat, or unknown. Platform colors must not leak into trend, status, or action semantics.
- Ranking or TOPSIS-style scores use neutral/brand typography first; only the Star / Long Tail quadrant chips may mirror trend-up red / trend-down green, while normal score values still reserve trend colors for deltas and status colors for state.
- Domain taxonomy semantics are business categories: traffic hierarchy, TOPSIS quadrants, funnel stages, creator levels, and cooperation stages. They must remain scoped palettes and must not be collapsed into status, trend, platform, or brand action colors.
- Chart color priority: platform colors > trend colors > status colors > domain taxonomy colors > ordinary chart series colors. If a chart series has no special semantics, use the Chart Series Palette.

## Material Layer Contract

Material tokens describe surfaces, translucency, glass borders, shadows, skeleton washes, and dark tooltip shells. They are visual depth primitives, not semantic colors.

- Use local CSS Module aliases named `--*-material-*` for page-specific glass/shadow/texture values before they are promoted to global runtime tokens.
- Material tokens may use `rgba()` and subtle gradients because they encode opacity, elevation, and overlay behavior. Do not use material tokens for business meaning, status, trend, platform identity, or domain taxonomy.
- Material tokens should sit behind semantic color tokens: semantic foregrounds, borders, chips, chart marks, and labels still use `--text-*`, `--border-*`, `--brand-*`, `--status-*`, `--trend-*`, `--platform-*`, `--domain-*`, or `--chart-series-*`.
- Allowed local material examples:
  - `--dashboard-material-glow-brand`
  - `--dashboard-material-surface-bg`
  - `--dashboard-material-shadow-*`
  - `--creator-material-tooltip-*`
  - `--creator-material-status-*`
  - `--creator-preview-*`
  - `--weekly-material-*`
- Before introducing a new raw `rgba()` or gradient, decide whether it is a material layer. If yes, add a local material alias. If no, map it to the correct semantic token first.
- Raw color enforcement is executable: run `npm run verify:design:raw-colors`. It scans tracked and untracked non-ignored CSS Modules plus non-module `apps/web-vite/src/**/*.ts(x)` / `apps/web-vite/src/**/*.css` files. CSS Modules may keep raw `#hex` / `rgb()` / `rgba()` / `hsl()` only in `--*-material-*` custom-property definitions; non-module files may keep raw colors only in the approved source files listed in `scripts/config/allowlists/design-raw-color-allowlist.json`.
- Tailwind color alias enforcement is executable: run `npm run verify:design:tailwind`. `tailwind.config.ts` must not contain raw color literals, and every custom color alias value must resolve to a CSS variable defined by `apps/web-vite/src/styles/design-tokens.css`.
- Tailwind non-color alias enforcement is executable: run `npm run verify:design:tailwind-non-color-aliases`. `tailwind.config.ts` spacing, radius, shadow, font-family, font-size, transition-duration, and transition-easing aliases must map to runtime CSS variables from `apps/web-vite/src/styles/design-tokens.css`; responsive `screens` must stay static literals synchronized with `DESIGN_TOKENS.json` and runtime breakpoint variables because media queries cannot safely rely on runtime CSS variables.
- Tailwind utility color usage is executable: run `npm run verify:design:tailwind-utilities`. Product source files must not introduce default Tailwind palette classes such as `text-gray-*`, `text-slate-*`, `bg-white`, `bg-gray-*`, or `border-gray-*`; they also must not introduce arbitrary raw-color utilities such as `bg-[#fff]`, `text-[color:#1A1A1A]`, or `shadow-[0_1px_2px_rgba(...)]`. Legacy compatibility aliases such as `text-primary`, `text-secondary`, `text-tertiary`, `text-error`, `text-info`, `bg-primary-500`, `text-warning-*`, `bg-warning-50`, `border-warning-200`, or `bg-bg-secondary` are also forbidden in product class strings and no longer exist as global utility classes. Use AIOS aliases such as `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `bg-bg-card`, `bg-bg-global`, `border-border-color`, `text-status-*`, `bg-status-*-soft`, `border-status-*`, `text-trend-*`, `bg-brand-primary`, or `text-brand-*` instead.
- Documentation drift enforcement is executable: run `npm run verify:design:docs`. Markdown docs in root authority files, `docs/`, and `apps/web-vite/src/docs/` must not reintroduce old component APIs (`isUp`, `KPIGrid`), old stylesheet names (`design-system.css`), Less-era color tokens (`@primary-color`, `@text-color`), legacy status token names (`--color-success`, `--color-danger`, `--color-warning`, `--color-info`), old neutral raw colors, stale `DESIGN.md` validation commands, or stale README `verify:ci` summaries that conflict with this authority.
- Promote local material tokens to global `DESIGN_TOKENS.json` only after the same material role is reused across multiple surfaces or pages.

## Raw Color Governance

Raw color values are allowed only at explicit design-system source boundaries. Ordinary pages, components, and CSS files must import constants, use CSS variables, or use semantic helpers instead of local `#hex` / `rgb()` / `rgba()` / `hsl()` values.

- Gate config lives in `scripts/config/allowlists/design-raw-color-allowlist.json`.
- Adding or removing an approved raw color source requires updating both `scripts/config/allowlists/design-raw-color-allowlist.json` and the table below in the same change.
- `npm run verify:design:raw-colors` also verifies that the allowlist paths and this table contain the same source files.
- Allowlist paths must be repository-relative `apps/web-vite/src/` paths, must exist, and must include owner/reason/allowed/notAllowed metadata.
- `apps/web-vite/src/lib/design-token-values.ts` is a value helper, not a raw color source. It should import from token/domain/platform sources instead of introducing new literal colors.
- ECharts adapter sync guards are consumers of the existing raw color sources, not new raw color sources. `apps/web-vite/src/theme/echarts-theme.ts` must stay raw-color-free and import values from `apps/web-vite/src/styles/echarts-theme.ts`; `apps/web-vite/src/styles/echarts.css` fallback literals must stay synchronized with documented chart/platform/text tokens via `npm run verify:design:echarts-css-token-sync`. Do not add either file to new raw color exceptions unless it deliberately becomes a DESIGN.md-backed source boundary.
- Source comments may mention color examples, but implementation values must still belong to the owning source category.

| Raw color source file | Owner | What belongs here | What does not belong here |
| --- | --- | --- | --- |
| `apps/web-vite/src/styles/design-tokens.css` | Runtime token source | Canonical runtime CSS variables for global color, shadow, chart, platform, and domain taxonomy tokens. | Page-local materials, one-off chart colors, component-specific values. |
| `apps/web-vite/src/lib/design-tokens.ts` | Static token mirror | Token values mirrored from `DESIGN_TOKENS.json`. | Manually invented component-local colors or values outside this document. |
| `apps/web-vite/src/lib/platform-colors.ts` | Platform legend color source | Platform legend and marker colors for Tmall, Douyin, Xiaohongshu, Kuaishou, JD, WeChat, and fallback platform markers. | Buttons, generic UI color, status color, trend color, or layout decoration. |
| `apps/web-vite/src/lib/domain-taxonomy-colors.ts` | Domain taxonomy color source | Traffic hierarchy, TOPSIS quadrants, funnel stages, creator levels, cooperation stages, and ordinary chart series aliases. | Generic status, platform, trend, or page-local material colors. |
| `apps/web-vite/src/styles/echarts-theme.ts` | ECharts token adapter | Chart theme constants, token-backed fallbacks, gradients, reusable chart helper materials, and the canonical TS values consumed by `apps/web-vite/src/theme/echarts-theme.ts`. | Page-specific chart category colors, duplicate platform/domain maps, or raw literals that should live in token/platform/domain sources. |
| `apps/web-vite/src/styles/echarts.css` | ECharts CSS adapter | ECharts CSS custom-property defaults and raw fallback values centralized only as `--echarts-fallback-*`; fallback values and exposed `--echarts-platform-*` / `--echarts-color-*` aliases must map back to documented platform, chart, text, and divider tokens. | Page-local CSS colors, one-off component styling, raw colors outside fallback declarations, or a second platform/chart palette source. |
| `apps/web-vite/src/theme/ant-theme.ts` | Ant Design theme adapter | Design-token mappings into Ant token slots and explicitly isolated dark-theme adapter values. | Page-specific Ant component styling or local color experiments. |
| `apps/web-vite/src/app/dashboard/creator/_components/creator-chart-colors.ts` | Creator chart color source | Creator chart text, structural, material, tooltip, level, and platform semantics grouped by role. | Generic AIOS UI colors, ordinary page styling, or values that should live in shared token/domain/platform sources. |
| `apps/web-vite/src/app/dashboard/_components/dashboard-token-aliases.css` | Dashboard runtime token source | Dashboard-local material primitives, translucent surfaces, shadows, and runtime aliases that must ship in production dashboard CSS. | Generic AIOS UI colors, new chart palettes, or values that should live in global design tokens, platform colors, or domain taxonomy colors. |
| `apps/web-vite/src/app/page-materials.css` | Homepage material token source | Homepage-local material primitives used by `page.module.css` and `page-hero.module.css`, imported as plain CSS so production extraction preserves the variables. | Generic AIOS UI colors, chart palettes, or values that should live in global design tokens, platform colors, or domain taxonomy colors. |

## Motion Language

- Motion principle: functional and restrained. AIOS should feel stable, not theatrical.
- Default duration: 150ms for hover/focus, 250ms for panel/card transitions, 350ms only for drawer/modal entrances.
- Default easing: `cubic-bezier(0.4, 0, 0.2, 1)`.
- Hover: use color, border, background, or slight shadow changes. Avoid large movement.
- Active: tactile feedback may use `translateY(1px)` or `scale(0.98)` for buttons only.
- Focus: visible 2px brand focus ring, never remove keyboard focus.
- Loading: skeletons that match the final layout; no generic full-screen spinner when a scoped skeleton is possible.
- Reduced motion: disable transform-heavy transitions under `prefers-reduced-motion: reduce`; keep opacity/color changes acceptable.
- Banned motion patterns: custom cursors, looping decorative animations on dashboards, parallax in operational pages, animating width/height/top/left, and hover glow effects.

## Component Grammar

- Layout: max-width constrained content, grid-first composition, 8px spacing rhythm. Dashboard density can be high but must remain scannable.
- Cards: use cards only when they group a task or dataset. Prefer subtle borders and white/near-white surfaces over heavy shadows.
- DeepSeek-like metric rows: important KPI groups may be unboxed and separated by whitespace; not every metric needs a card.
- Buttons: primary uses Brand Blue fill with Brand On Primary text; secondary uses white/outline; danger uses explicit danger only for destructive actions. Radius 6-12px depending on size.
- Tags/badges: 11-12px label, medium weight, soft background, no saturated fill unless status must interrupt.
- Status badges/panels: use `.status-badge-*` and `.status-panel-*` utilities or the `Badge` atom status prop. Do not compose status UI from raw Tailwind reds/greens/blues.
- Forms: label above input, helper text below, inline error below field. Never use floating labels.
- Navigation: active state should be a calm pill/capsule or clear underline; avoid high-contrast blocks unless in sidebar.
- Tables: compact, readable, tabular numbers, muted headers, restrained row hover. Avoid multiline numeric cells unless unavoidable.
- Trend indicators: use semantic trend tokens, not raw success/error tokens. Always include sign for positive values and keep neutral as muted text.
- Charts: low-noise axes, subtle grid lines, muted labels, one dominant series color. Tooltips should be legible, compact, and token-mapped.
- Tooltips: 12px labels, 14-20px values depending on importance; avoid inline hardcoded color strings where CSS module classes can carry tokens.
- Empty/error states: explain the next action. Empty states should not be decorative filler.

## Component and Module Boundary

Components and modules are both useful, but they solve different problems. Shared components protect reusable UI contracts; domain modules isolate business complexity.

### Shared Component Boundary

- Shared components live in `apps/web-vite/src/components/**`.
- A shared component should be reusable across pages or encode a recurring AIOS UI pattern: typography, status, trend, KPI, chart shell, filter, table helper, empty/error/loading state, or navigation shell.
- Shared components may import token helpers, shared chart/domain/platform color resolvers, auth/navigation helpers, and generic API helpers only when the component itself is intentionally application-level.
- Shared components must not import from `apps/web-vite/src/app/**`, depend on route-specific files, or hardcode a dashboard/report/DataOps page path.
- Shared visual components should expose exported props contracts. Run `npm run verify:components:api` before changing shared component APIs.
- Shared component boundary enforcement is executable: run `npm run verify:components:boundaries`. It blocks imports from `apps/web-vite/src/components/**` back into `apps/web-vite/src/app/**`, including `@/app/*` aliases and relative imports that resolve into app routes.
- Shared component visual inline-style governance is executable: run `npm run verify:components:inline-styles`. Existing inline `color`, `background`, `fontSize`, and related visual styles in shared components are frozen in `scripts/shared-inline-visual-style-allowlist.json` (currently zero-budget); new shared component visual styling should use CSS Modules, Tailwind token aliases, CSS variables, or component props instead.
- App route visual inline-style governance is executable: run `npm run verify:app:inline-styles`. Existing route-local inline visual styles are frozen in `scripts/app-inline-visual-style-allowlist.json`; new `apps/web-vite/src/app` visual styling should use route CSS Modules, Tailwind token aliases, CSS variables, or component props instead of increasing inline visual style debt.
- Do not move a one-off page block into `apps/web-vite/src/components` just because it is visually large. Promote it only after the pattern appears in multiple modules or needs a stable cross-page contract.

### Domain Module Boundary

- Domain modules live under `apps/web-vite/src/app/<domain>/**`, normally with local `_components`, `_hooks`, `_types.ts`, `_utils.ts`, and `*.module.css`.
- Domain modules may contain business field names, API response mapping, page state, filters, drilldown behavior, export logic, and page-specific chart option builders.
- Domain modules may compose shared components, but shared components should not reach back into domain modules.
- A local `_components` item does not need to be reusable. Its job can be readability, lifecycle isolation, or keeping a large domain page understandable.
- Cross-route families may keep a deliberate shared layer at `apps/web-vite/src/app/<family>/_components/**` when the UI is reused only inside that route family. Do not use a sibling route such as `weekly/_components` or `monthly/_components` as an informal shared package.
- Extract a domain submodule when one file owns multiple independent concerns such as data fetching, filter state, chart option building, table columns, drawer state, and export actions.
- App module boundary enforcement is executable: run `npm run verify:app:boundaries`. Route/domain modules under `apps/web-vite/src/app` must not import sibling or parent route internals unless the current legacy coupling is explicitly frozen in `scripts/app-module-boundary-allowlist.json`; reusable code should move to `apps/web-vite/src/components`, `apps/web-vite/src/lib`, `apps/web-vite/src/hooks`, `apps/web-vite/src/types`, or a deliberate shared reports/domain layer.

### Extraction Heuristics

- Promote to shared component when the UI pattern is reused in at least two modules, needs DESIGN.md token discipline, or has a stable props contract.
- Keep local when the logic uses domain-specific field names, route params, API payload shapes, or page-only copy.
- Split into module files before promoting to shared components when a page is large but the logic is still domain-specific.
- Avoid premature abstraction: if extracted props become more complex than the original JSX, keep it local and revisit after the second use case.

## Component Contracts

### Status Badge / Status Panel Contract

- Use `Badge` from `apps/web-vite/src/components/atoms/badge.tsx` for reusable status labels.
- Use `.status-badge-*` for inline labels and `.status-panel-*` for soft feedback panels.
- Allowed statuses: `success`, `warning`, `danger`, `error`, `info`, `neutral`.
- Never compose status UI from raw Tailwind palette utilities such as `text-red-500`, `bg-green-50`, `border-blue-100`, or local hex colors.
- Do not use trend colors for status. Trend tokens describe business movement; status tokens describe system state.

### Trend Indicator Contract

- Use `--trend-up`, `--trend-down`, and `--trend-neutral`.
- Always display an explicit sign for positive values.
- Neutral, unavailable, or divide-by-zero states use muted text, not success or danger.
- Do not infer business good/bad from red/green alone; the semantic direction is the authority.

### Platform Chart Contract

- Use `apps/web-vite/src/lib/platform-colors.ts` for platform legend and marker colors.
- Do not create page-local platform color maps unless the page handles a one-off platform outside the shared alias map.
- Platform colors are allowed in pie charts, legends, markers, and category dots.
- Platform colors are not allowed for buttons, ordinary links, status badges, trend indicators, table text, or layout decoration.
- Douyin `#000000` is a platform legend exception only.

### Chart Contract

- Default chart text uses `--chart-label-color` or `--text-tertiary`.
- Grid lines use `--divider-color`; axes use `--border-color`.
- Use platform colors only for platform category comparison.
- Use trend tokens only for delta, direction, or positive/negative contribution semantics.
- Use status colors only for system/workflow status distribution.
- Use domain taxonomy palettes only for traffic hierarchy, TOPSIS quadrants, funnel stages, creator levels, cooperation stages, or other documented business category systems.
- Use ordinary chart series colors only when the series are plain metrics with no stronger semantic palette.
- Bar chart default: one metric uses Series 1 only; current vs previous uses Series 1 vs Muted; multi-metric grouping uses Series 1-6 in order.
- Line chart default: one line uses Series 1; current period is solid Series 1, previous period is dashed Muted; hover/selected point may use Highlight.
- Legend marker uses the series/category color; legend text remains `--text-secondary`.
- Prefer fewer series and clearer legends over saturated palettes.
- Tooltips should use compact labels, tabular values, and token-derived text colors.
- ECharts option builders should consume `ECHARTS_CHART_TOKENS`, `getChartColor`, `apps/web-vite/src/lib/platform-colors.ts`, or `apps/web-vite/src/lib/domain-taxonomy-colors.ts`; they must not repeat raw chart, platform, trend, status, or domain hex literals inside page-local option builders.

### Domain Taxonomy Contract

- Use the Domain Taxonomy Color System for traffic L1/L2/L3, Goods TOPSIS quadrants, funnel stages, creator levels, and cooperation stages.
- Domain colors apply to chips, dots, row accents, chart marks, stage nodes, and category fills. Body text and table numeric values remain neutral.
- Domain chips use 11-12px UI font, weight 560-620, soft background, subtle border, and category text color.
- Domain chart labels remain neutral; the colored part should be marker/bar/line/pie slice, not full text blocks.
- Domain palettes are scoped by business meaning. Do not reuse traffic hierarchy blue as generic info, creator S blue as brand CTA, or cooperation paused red as generic danger.

### Table Contract

- Header text is muted and compact.
- Numeric cells use tabular/mono treatment.
- Row hover uses `--bg-hover`.
- Avoid multiline numeric cells. If unavoidable, make the primary value first and secondary value muted.
- Status columns use status badges; trend columns use trend indicators.

### Filter / Form Contract

- Labels sit above inputs. Helper and error text sit below.
- Active filter summaries use `.status-panel-info` unless they represent a warning or error.
- Date range confirmations use `.status-panel-success`.
- Destructive reset or clear actions must use danger semantics only when the action is irreversible or meaningfully destructive.

### Drawer / Modal Contract

- Drawers and modals are task surfaces, not decoration.
- Header must state the selected entity or action.
- Body should use sections, dividers, and tables before adding nested cards.
- Footer actions must have one primary action and clear secondary/cancel actions.

## Cross-page Consistency Rules

- Must keep consistent: font families, numeric tabular treatment, text hierarchy, trend colors, chart axis/grid colors, border radius, and button/tag density.
- Allowed local variation: platform brand colors, chart series colors for categorical comparison, and page-specific dense table layouts.
- Forbidden deviations: introducing a second primary accent, using an alternate legacy blue as a shadow primary, using pure black, random one-off gray scales, local trend color definitions, or page-only type scales without adding tokens.
- Conflict resolution order:
  1. Product/business meaning and data correctness.
  2. `DESIGN.md` style authority.
  3. `apps/web-vite/src/styles/design-tokens.css` runtime tokens.
  4. Ant Design / ECharts / Tailwind implementation mappings.
  5. Local CSS Modules.
- If a page needs a new color or type scale, add it to the token layer first or document why a local exception is temporary.
- If a page grows into a large domain module, split by business concern first. Do not push domain-specific state or API mapping into shared components to make the page file look smaller.

## Documentation Ownership

- `DESIGN.md` is the only style authority. New rules for typography, color, spacing, status/trend semantics, chart palettes, token governance, and validation must be added here first.
- Obsolete auxiliary design docs are intentionally retired. Do not recreate `apps/web-vite/src/docs/FRONTEND_DESIGN_SYSTEM.md` or `apps/web-vite/src/docs/COMPONENT_LIBRARY.md` as parallel rule sources.
- Component contracts must come from current TypeScript source, exported types, and focused code examples near the implementation. If a reusable component needs better documentation, add JSDoc, Storybook-style examples, or a generated API catalog instead of hand-maintaining another design-rule document.
- Component API discoverability is executable: run `npm run verify:components:api`. Reusable component `*Props` contracts in `apps/web-vite/src/components/**/*.tsx` must be exported from source, so consumers and tooling can import the real API instead of reading stale Markdown.
- CSS Module size governance is executable: run `npm run verify:css-modules:size`. New CSS Modules must stay under the global size cap, and legacy oversized modules in `scripts/css-module-size-allowlist.json` are frozen so style debt can only shrink.
- If duplicated guidance appears in a new doc, keep the canonical rule in `DESIGN.md` and replace the duplicate with a pointer or delete it.
- The direction is fewer rule documents, not more. Preserve only executable gates, runtime tokens, generated mirrors, and docs that have a clear maintenance owner.

## Implementation Rules

- Runtime token source: `apps/web-vite/src/styles/design-tokens.css`.
- Generated/static token mirror: `DESIGN_TOKENS.json` and `apps/web-vite/src/lib/design-tokens.ts`; this full mirror is enforced by `npm run verify:design:mirror`.
- Runtime CSS token sync is executable: run `npm run verify:design:runtime-tokens`. Non-color token families in `apps/web-vite/src/styles/design-tokens.css` (typography, spacing, radius, shadow, transition, breakpoint, and component tokens) must match `DESIGN_TOKENS.json`; do not hand-tune runtime CSS without updating the token mirror.
- Transition tokens are split by CSS property semantics: `--transition-*` remains a full shorthand token for author CSS (`transition: all var(--transition-fast)`), while Tailwind `transitionDuration` must use duration-only `--transition-duration-*` tokens and Tailwind `transitionTimingFunction` must use easing-only `--transition-easing-*` tokens.
- Theme adapter value helper: `apps/web-vite/src/lib/design-token-values.ts`; React theme context, Ant Design adapters, and ECharts adapters should import it instead of duplicating hex values. Value-helper sync is executable: run `npm run verify:design:token-values-sync`; `DESIGN_COLOR_VALUES`, `DESIGN_FONT_FAMILY`, and `DESIGN_SHADOW_VALUES` must stay mapped to `designTokens`, `PLATFORM_LEGEND_COLORS`, and `CHART_SERIES_COLORS` rather than local literals.
- Raw color source allowlist: `scripts/config/allowlists/design-raw-color-allowlist.json`; this file is enforced by `scripts/checks/design/raw-colors-non-modules.mjs` and `scripts/checks/design/raw-color-allowlist-docs.mjs`, and must stay aligned with the Raw Color Governance table.
- Token color sync coverage config: `scripts/design-token-color-sync.config.json`; this file is enforced by `scripts/checks/frontend/design-token-color-sync.mjs` and owns the status, trend, platform, chart, and domain taxonomy keys covered by `npm run verify:design:tokens`.
- Token generator boundary enforcement is executable: run `npm run verify:design:token-generator`. `scripts/build/compile-tokens.js` is scoped to `apps/web-vite/src/lib/design-tokens.ts`; it must not generate CSS shims, Tailwind config, Ant Design theme adapters, or runtime token CSS.
- Tailwind aliases live in `tailwind.config.ts` and are enforced by `npm run verify:design:tailwind` plus `npm run verify:design:tailwind-non-color-aliases`; Tailwind is a token consumption surface, so custom aliases must point back to runtime CSS variables instead of hardcoded legacy palette or sizing values. Do not reintroduce nested compatibility palettes such as `primary.500`, `success.500`, `warning.50`, `error.500`, or `info.DEFAULT`; add explicit semantic aliases instead.
- Tailwind default palette utility debt, arbitrary raw-color utility usage, and legacy compatibility color aliases are enforced by `npm run verify:design:tailwind-utilities`. `scripts/tailwind-utility-color-allowlist.json` is a temporary legacy-debt ledger for default palette utilities only, not permission for new default palette usage and not an escape hatch for arbitrary raw colors or compatibility aliases; any reduced count must shrink the allowlist in the same change.
- Ant Design token mapping lives in `apps/web-vite/src/theme/ant-theme.ts` and is enforced by `npm run verify:design:antd-theme-token-sync`; this guard owns AntD adapter consumption of `DESIGN_COLOR_VALUES`, `DESIGN_FONT_FAMILY`, and `DESIGN_SHADOW_VALUES`, while the helper internals remain owned by `npm run verify:design:token-values-sync`. Selected numeric adapter values must stay synchronized with `DESIGN_TOKENS.json`, component-level Ant tokens are part of the adapter contract, and optional dark adapter raw values must stay isolated in `ANT_DARK_THEME_ADAPTER_COLORS` without implying runtime dark mode support.
- ECharts defaults live in `apps/web-vite/src/styles/echarts-theme.ts`, `apps/web-vite/src/theme/echarts-theme.ts`, and `apps/web-vite/src/styles/echarts.css`; keep `apps/web-vite/src/styles/echarts-theme.ts` grouped by series, text, surface, structural, material, and semantic series roles, and keep `apps/web-vite/src/styles/echarts.css` raw fallback literals only in `--echarts-fallback-*` declarations.
- ECharts adapter sync is executable: run `npm run verify:design:echarts-theme-token-sync`. This guard owns only ECharts adapter consumption across `apps/web-vite/src/styles/echarts-theme.ts` and `apps/web-vite/src/theme/echarts-theme.ts`; canonical token equality remains owned by `npm run verify:design:tokens`, and raw literal placement remains owned by `npm run verify:design:raw-colors`.
- ECharts CSS fallback sync is executable: run `npm run verify:design:echarts-css-token-sync`. This guard owns `apps/web-vite/src/styles/echarts.css` fallback value equality and public CSS alias chains; new ECharts fallback variables must first be backed by `DESIGN_TOKENS.json`, platform/domain source constants, or a documented material derivation.
- Platform legend resolution lives in `apps/web-vite/src/lib/platform-colors.ts`.
- Domain taxonomy and ordinary chart series maps live in `apps/web-vite/src/lib/domain-taxonomy-colors.ts`.
- Creator dashboard chart color source lives in `apps/web-vite/src/app/dashboard/creator/_components/creator-chart-colors.ts`; keep it grouped by text, structural, material, tooltip, and level/platform semantics.
- Token mirror drift is forbidden. Status colors, trend colors, platform legend colors, ordinary chart series colors, and domain taxonomy colors must stay synchronized across their owning sources: `DESIGN_TOKENS.json`, `apps/web-vite/src/lib/design-tokens.ts`, `apps/web-vite/src/styles/design-tokens.css`, `apps/web-vite/src/lib/platform-colors.ts`, and `apps/web-vite/src/lib/domain-taxonomy-colors.ts`; run `npm run verify:design:tokens`.
- If a token value changes, keep the CSS token, JSON token, TypeScript mirror, Tailwind alias, and theme mappings aligned. `DESIGN_TOKENS.json` and `apps/web-vite/src/lib/design-tokens.ts` must remain structurally identical, including typography, spacing, radius, shadow, and component tokens.
- Prefer semantic helpers over page-local constants. Local constants must be named by category and justified by chart/category scope.
- Do not introduce new dependencies for visual polish unless the package already exists in `package.json` or the user explicitly approves installation.
- Do not introduce dark mode behavior unless the task explicitly targets dark theme. Current AIOS runtime is light theme only.
- `apps/web-vite/src/theme/ant-theme.ts` may keep explicit Ant Design dark adapter exception values only inside `ANT_DARK_THEME_ADAPTER_COLORS`; do not spread dark raw colors through light theme tokens or components.

## Agent Implementation Protocol

- Before editing a page, classify it into one page archetype from this document and follow that archetype's density, hierarchy, and component grammar.
- Before editing `apps/web-vite/src/app/reports/special/**`, apply the Static Special Reports contract first, then the generic Report Pages archetype. If a requested layout would make the report read like a dashboard, update the report structure or this authority document instead of adding local visual exceptions.
- Before adding a color, font size, shadow, radius, or chart palette, check whether an existing token or component contract already covers the role.
- Before extracting UI, decide whether the target is a reusable shared component or a domain module file. Shared components protect product-wide contracts; domain module files protect page maintainability.
- If adding or changing a token, update every mapped implementation surface in the same change set: CSS variables, JSON mirror, TypeScript mirror, Tailwind aliases, Ant Design theme, and ECharts defaults when relevant.
- If adding a reusable visual state, prefer a small component or utility class over page-local CSS. Page-local styling is acceptable only for layout or one-off chart/category presentation.
- If a rule conflicts with runtime behavior, inspect the runtime implementation first, then update this document only when the intended behavior is confirmed.
- Do not weaken this authority with vague exceptions such as "looks nicer here". Exceptions must name the affected page, reason, risk, and planned removal condition.

## Validation Commands

For frontend style authority or token changes, run the smallest relevant closed loop:

```bash
bash ~/.codex/tools/frontend_worker_entry.sh \
  --frontend-tier L1-V \
  --skills design-taste-frontend,frontend-skill,stitch-design-taste \
  --style-authority-path $PWD/DESIGN.md

npm run lint
npm run verify:design:raw-colors
npm run verify:design:tailwind
npm run verify:design:tailwind-non-color-aliases
npm run verify:design:tailwind-utilities
npm run verify:design:docs
npm run verify:design:docs-behavior
npm run verify:design:token-values-sync
npm run verify:design:token-generator
npm run verify:design:antd-theme-token-sync
npm run verify:design:echarts-theme-token-sync
npm run verify:design:echarts-css-token-sync
npm run verify:components:api
npm run verify:design:mirror
npm run verify:design:tokens
npm run verify:design:runtime-tokens-behavior
npm run verify:design:runtime-tokens
npm run verify:frontend:build-fingerprint-behavior
npm run verify:frontend:quality-docs-drift-behavior
npm run verify:frontend:quality-docs-drift
npm run verify:frontend:design-evolution-behavior
npm run verify:frontend:design-evolution
npm run verify:frontend:delivery-gate-registry-behavior
npm run verify:frontend:delivery-gate-registry
npm run type-check
npm run build
npm run verify:frontend:preflight
git diff --check
```

For docs-only `DESIGN.md` changes, `frontend_worker_entry.sh` and `git diff --check` are the minimum validation. Run full lint/type/build when the design authority change could affect token or component implementation.

## Acceptance Checklist

- [ ] Typography uses the UI/display/mono font stacks and documented sizes.
- [ ] New font sizes follow the Type Scale Contract or are added as tokens before use.
- [ ] Shared components stay in `apps/web-vite/src/components/**`; domain-specific logic stays in `apps/web-vite/src/app/<domain>/**`.
- [ ] Color values map to semantic CSS variables unless a local category palette is justified.
- [ ] Trend indicators use `--trend-up`, `--trend-down`, and `--trend-neutral`.
- [ ] ECharts axes, grids, labels, ordinary series, and semantic category series follow this authority.
- [ ] Ant Design theme maps to AIOS tokens.
- [ ] Status UI uses status utilities or the Badge atom, not raw Tailwind palette utilities.
- [ ] Platform chart colors resolve through `apps/web-vite/src/lib/platform-colors.ts`.
- [ ] Traffic hierarchy, Goods TOPSIS quadrants, funnel stages, creator levels, and cooperation stages use the Domain Taxonomy Color System.
- [ ] Ordinary bar/line chart legends use chart series markers with neutral legend text.
- [ ] Page implementation follows the matching page archetype.
- [ ] Special report pages follow the Static Special Reports contract: report-like cover, conclusion-led sections, chart-first evidence, secondary tables, quiet TOC, and intentional deferred sections.
- [ ] Static report pages follow the cognition grammar: one question, one conclusion, one dominant visual proof, secondary tables, and quiet footnotes per page or major section.
- [ ] Static report routes follow the page composition reference: cover plus 6-9 primary reading sections, with compression rationale before exceeding 9.
- [ ] Static report annotation labels follow the taxonomy: direct evidence carries the claim, while corner notes, footnotes, and methodology notes carry source/caveat/gap governance.
- [ ] Static report charts use the decision matrix before selecting chart types, and the page remains understandable without tooltip hover.
- [ ] Static report chart reference lines declare their source, and browser validation proves mounted canvas/SVG output with non-zero dimensions.
- [ ] Static report chart acceptance rubric passes: no tooltip-only primary evidence, no null-as-zero marks, <=6 visible legend categories unless justified, 390px mobile has no horizontal overflow, and print/export has no clipped chart output.
- [ ] New static report visual templates have catalog entries before use, including DOM-rendered tile heatmaps and ECharts-rendered bullet / benchmark band charts.
- [ ] Motion remains functional, calm, and accessible.
- [ ] No pure black, neon glow, or arbitrary dashboard-only font system is introduced.
- [ ] `stitch-design-taste` preflight passes with this file as `style_authority_path`.
