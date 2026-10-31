# Design System: AIOS

> Purpose: AIOS front-end style authority for humans, Codex, and `stitch-design-taste`.
> Scope: `apps/web-vite/src/` pages, shared components, dashboard charts, DataOps console, reports, and marketing/workspace shells.
> Visual language: **v2** ("ink is people, violet is AI", built on `@lobehub/ui` 6 + Base UI) with the **v3 layout grammar** (untinted gray neutrals, few boxes, light weights; 2026-10-24) is the only visual language; Ant Design is removed. See [Visual Language v2](#visual-language-v2), [Layout Grammar v3](#layout-grammar-v3) and [Visual System Migration](#visual-system-migration).
> Runtime sources: v2 roles live in `apps/web-vite/src/styles/aios-theme.css` on top of lobe-ui's `--lobe-*` theme; the shared token names (`--text-*`, `--bg-*`, `--brand-*`, `--status-*`, `--chart-series-*`, …) live in `apps/web-vite/src/styles/design-tokens.css` with v2 values, mirrored from `DESIGN_TOKENS.json`, and Tailwind and ECharts map back to them.

## Brand & Product Context

- Product name: AIOS (formerly DataHub); current display name: AGI AIOS.
- Product tagline: AI 驱动的业务生产力系统.
- Naming transition: this remains the same product. Preserve the retired Agent boundary while technical identities migrate under the release plan; the visual language moved from v1 to v2 (owner decision 2026-10-23; every page migrated by 2026-10-24).
- Domain: AI content production (AI 创作中心: footage, outputs, AI editing, competitor hits) is the deployed production surface; enterprise data operations, commerce analytics, reporting, and internal data-product workflows remain in the repository as groland modules.
- Core users: content operators and editors who direct AI work on footage every day, plus operators, analysts, founders, and internal data/BI maintainers who read dense metrics.
- Primary scenarios: footage intake and AI analysis, AI editing and output review, competitor hit analysis, dashboard monitoring, weekly/monthly reports, DataOps runtime diagnosis, and operational admin.
- Design direction (v2): an AI-native product console. Ink-on-neutral structure, one AI violet that marks where AI acts, media as the hero, calm density, and motion only while AI works. References: Linear for restraint and a single accent, Grok for stark monochrome, lobe-ui for component craft.
- Product identity: public navigation, login and recruiting surfaces use the AIOS / AGI AIOS name without the former Groland logo. The global header uses the owner's AIOS Brand Final geometric wordmark (2026-10-29): transparent black in Light and white in Dark, following the app's `data-theme`, at 96px wide with its original proportions and a 44px minimum link target. Use the supplied SVGs in `public/brand/`, without a surrounding tile, added text, border or shadow. Browser and home-screen icons use the supplied notched O: SVG plus 32px PNG and multi-size ICO fallbacks, and the 180px Apple touch icon. The module-level AI 创作中心 sparkle remains its own module icon; the login mark remains separate; standalone recruiting uses the same supplied wordmark in its compact header (2026-10-30). Historical business reports retain their factual company and product names.
- Brand source (v2): lobe ink (`--lobe-color-primary`, near-black in light and near-white in dark) on lobe's untinted gray neutrals (v3; v2 used `mauve`), plus AI violet `#6E56CF`.
- Existing constraints: Vite + React + React Router, `@lobehub/ui` 6.9.0 (Base UI 1.9 underneath, `motion` 14, `lucide-react` icons, pinned exactly), Tailwind CSS v4, CSS Modules, ECharts, CSS variables. Ant Design is removed; do not reintroduce it.
- Tailwind v4 uses `@tailwindcss/vite` and explicit `@config` loading of `tailwind.config.ts`; its content paths remain the source scan boundary. `globals.css` declares `@layer theme, aios-base, reset, lobe-base, lobe-popup, lobe-ui;`: Tailwind theme variables sit in `theme`, `design-system-base.css` in `aios-base`, Preflight (with the v3 default border color through the framework gray-200 variable) in `reset`, and lobe-ui's precompiled styles in its own three layers. Global theme rules (`light-theme/*`), CSS Modules, and Tailwind utilities stay unlayered and therefore beat every layered rule. `tailwind-css-pipeline.test.ts` pins this order; do not reorder layers or move utilities into a layer without browser regression evidence.
- Supported browser minimums for this integration: Chrome 111+, Safari 16.4+, Firefox 128+ (accepted for the v4 migration). This compatibility target does not imply all three engines were tested locally.
- Do not copy a reference product's wordmark, logo, or exact palette. Absorb restraint, accent discipline, typographic hierarchy, tabular numerals, and density.

## Visual Language v2

Owner decision 2026-10-23. AIOS is an AI-native product: the interface answers "who is acting now". **Ink is people and structure; AI violet is AI presence.** Media is the hero, the console stays calm, and only AI work moves.

### Color Roles

| Role | Token | Light | Dark | Use | Never |
| --- | --- | --- | --- | --- | --- |
| Surfaces, text, borders | lobe `--lobe-color-bg-layout`, `-bg-container`, `-bg-elevated`, `-text`, `-text-secondary`, `-text-tertiary`, `-border`, `-border-secondary`, `-fill-*` | lobe gray (no neutral palette) | lobe gray dark: black ground, `#0D0D0D` panel | page ground, cards, dividers, body and secondary text | page-local grays |
| Ink | `--lobe-color-primary` | `#222222` | `#EEEEEE` | human primary action (one per region), current navigation text, brand mark | starting AI work |
| AI fill | `--aios-ai-fill` / `--aios-ai-on-fill` | `#6E56CF` / white | same | the button that starts AI work (✦ 生成, 合成, 开始分析); at most one per screen | human actions, large areas |
| AI text | `--aios-ai-text` | `#5B45B8` | `#BAA7FF` | AI labels and AI-only surfaces (since 2026-10-25 links are ink) | body text, links |
| AI mark | `--aios-ai-mark`, `--aios-ai-9` | `#6E56CF` | `#8B74F0` | AI-cut timeline edges, AI dots, selection indicators | status |
| AI soft | `--aios-ai-soft`, `--aios-ai-soft-hover`, `--aios-ai-border` | `#F4F0FE` / `#D4CAFE` | `#291F43` / `#473876` | AI chips, AI suggestion cards, selected rows | human content |
| AI sweep | `--aios-ai-sweep-from` → `--aios-ai-sweep-to` | `#6E56CF` → `#B79CFF` | `#6E56CF` → `#D2C4FF` | only while AI works: generating border, thinking text, progress | anything at rest |
| Media stage | `--aios-stage`, `--aios-stage-text` | `#0B0C0E` | `#0B0C0E` | video and image previews, players | ordinary cards |
| Status | `--aios-status-*` text with lobe `--lobe-color-{success,warning,error,info}-{bg,border}` | AA text values | dark values | system and workflow state, always with text or an icon | business deltas, AI presence |
| Trend | `--aios-trend-up`, `--aios-trend-down` | `#D9363E`, `#13A05A` | `#FF6B6B`, `#4ADE80` | business deltas (red up, green down) with an explicit sign | status |
| Chart series | `--aios-chart-1..5`, `--aios-chart-muted` | violet, teal, amber, blue, rose | dark steps | ordinary multi-series comparison in fixed order | platform, trend, status meaning |

- The AI violet scale `--aios-ai-1..12` has light and dark steps in `aios-theme.css`; roles reference steps, components reference roles.
- AI violet never marks a non-AI action and never fills a large area. A screen with two violet-filled buttons is wrong.
- AI violet is not informational status: system info uses `--aios-status-info` (blue) with an icon.
- The AI sweep is the only gradient on v2 surfaces and only while AI works. Banned: purple-to-blue neon gradients, rainbow palettes, glow, gradient text at rest, and pure black text (the stage is a surface, not a text color).
- Platform legend colors and domain taxonomy palettes keep their sources (`platform-colors.ts`, `domain-taxonomy-colors.ts`); a dark v2 surface that renders them adds dark values first (Douyin black needs a light marker on dark).
- Chart series v2 passed the categorical palette validator (lightness band, chroma floor, adjacent CVD separation ≥ 13 ΔE, normal-vision floor, 3:1 against the surface) on both light and dark.

### Themes

- Light is the default. lobe-ui provides the dark theme through `setLobeTheme({ appearance })`, which writes `data-theme` on `<html>`; every `--aios-*` color has a designed dark value, not an inversion.
- Viewers choose 跟随系统 / 浅色 / 深色 under 外观 in the account menu (`lib/theme-preference.ts`, remembered per browser in `aios.appearance`; light until they choose).
- What follows the theme: lobe and `--aios-*` variables directly; the shared names through the bridge; domain taxonomy fills, borders and text through generated dark values in `aios-theme.css` (text kept at 4.5:1); page materials through the `:root[data-theme='dark']` blocks at the end of their stylesheets; ECharts through `lib/echarts-appearance.ts`, which the chart wrappers apply on every `setOption` and on each theme switch. A new raw material color needs its dark value in the same change.
- Media previews use the stage in both themes.

### Typography

- UI and headings: `--aios-font-ui` (Geist Variable for Latin and digits, then PingFang SC / HarmonyOS Sans SC / Microsoft YaHei / Noto Sans SC). Data: `--aios-font-data` (Geist Mono Variable) with tabular numerals for money, percentages, timecodes, durations, and IDs. The lobe provider loads them: Geist self-hosted, HarmonyOS Sans SC from npmmirror (see Typography System).
- The Type Scale Contract tokens below stay authoritative; they do not depend on the component library. Headings use weight 600 with tight tracking; hierarchy comes from size, text level, and space before weight.

### Shape, Depth, and Density

- Radius: controls 8px (`--lobe-border-radius`), cards and popovers 12px (`--lobe-border-radius-lg`), small marks 6px (`--lobe-border-radius-sm`). No pill-shaped buttons.
- Depth: hairline borders and surface steps; shadows (`--lobe-box-shadow*`) only on floating layers (menus, popovers, modals, drawers), which may use lobe's blurred backgrounds.
- Density: 8px rhythm. Workspaces are compact; overview and report pages get more air; KPI groups need not be boxed.

### Motion

- UI transitions are short and quiet (150–250ms); popups use lobe's motion springs (`--lobe-motion-*`).
- Persistent motion exists only while AI works: the sweep (about 2.4s linear loop), the thinking pulse (about 1.4s), and streaming text. It stops when the work stops.
- `prefers-reduced-motion: reduce` removes all of it; the state must still read from text.

### AI Grammar

- AI output marker: ✦ plus an AI soft chip on anything AI produced (labels, segments, scores, copy). Disclosure shows model and time. After human confirmation it becomes a neutral 人工确认 chip.
- AI task states, identical everywhere: 排队中 (neutral dot and queue position), 思考中 (pulsing AI dot and sweeping text that says what AI is doing), 生成中 (sweep border and a progress bar with a percentage), 已完成 (success dot and time), 失败 (danger text, the reason, and 重试), 已取消 (neutral dot; a person stopped it, so never danger). Never a bare spinner. Finer backend states keep the nearest state's color and motion under their own word (部分完成, 渲染中, 已暂停, 取消中). Tables, side lists and card heads use `AiTaskStatus compact` (dot and words, percent instead of a bar); panels and drawers use the full box.
- AI action buttons: AI fill, the label starts with ✦ and a verb, and a disabled state says why. The fill marks the one AI start on a screen; the same start repeated per table row or card is `AiActionButton quiet` (outlined, violet ✦).
- Human in the loop: AI suggestions offer accept, edit, and dismiss; accepting converts the marker.
- Media timelines: AI-cut segments carry an AI mark left edge on AI soft; human segments stay neutral.

### Components

- Build from `@lobehub/ui` 6 first: Button, Select, Segmented, Tabs, Table / ProTable, Form, DatePicker, Upload, Modal, Drawer, DropdownMenu, Toast, Tooltip, Alert, Empty, Skeleton, Tag, and the Dashboard set (ConsoleShell, ConsoleNav, Breadcrumb, PageHeader, Surface, Section, StatCard). Use `@base-ui/react` directly only for a gap lobe-ui does not cover. Icons come from `lucide-react`.
- Style lobe components only through `className` / `classNames` / `styles` slots, `.lobe-*` classes, `data-*` attributes, and `--lobe-*` / `--aios-*` variables. Never target StyleX hashed classes.
- lobe Select and Segmented do not forward `aria-label` or a root `className`: use `LabeledSelect` (`components/molecules/labeled-select.tsx`, which also keeps `''` 「全部」 options visible, since Base UI treats an empty value as no selection) and wrap Segmented in a `role="group"` with `aria-label`.
- Popconfirm becomes a button whose click calls `confirmModal` (destructive: `okButtonProps: { danger: true }`); `message` becomes `toast`; range sliders use Base UI's `Slider` directly (lobe's is single-valued).
- CSS Modules on v2 surfaces use `--lobe-*` for UI primitives and `--aios-*` for AIOS roles. Legacy names work through the bridge, but new code does not add them.

## Layout Grammar v3

Owner decision 2026-10-24, after the v2 pages read as an "admin console": v2 changed components, colors and fonts but kept a box per section and a sentence per control. v3 keeps every v2 role (ink, AI violet, status, stage, motion) and changes how pages are organized. References: Linear and Vercel for restraint.

- Neutrals: lobe's untinted gray, no neutral palette. Light ground `#F8F8F8`, cards `#FFFFFF`, borders `#E3E3E3` / `#EEEEEE`; dark ground `#000000`, panel `#0D0D0D`, borders `#202020` / `#1A1A1A`. No tinted grays.
- One layer of containers. Sections are a small title, whitespace and hairlines (`--lobe-color-border-secondary`); never a bordered card inside a bordered card. A frame is allowed only for a unit that must read as one object (a stage strip, a media tile, a form); the console's content panel already is the page's frame.
- Type ladder: console page title 20px / 600 (`--font-size-section-title`); brand name 16px / 600; section titles and nav items 14px (500 / 400); body 14px / 400; labels 13px / 500 (`--font-size-md`: sidebar group names, stat labels, chip names); meta 12px / 400 tertiary (timestamps, captions, footnotes only). A parent label is never smaller than 13px, and an icon beside text is at most 2px larger than the text (16px icons with 14px nav). Numbers use tabular numerals at weight 500 (24px for a headline figure). Bold is not a hierarchy tool: size and gray level are.
- Contrast: tertiary text is `#707070` in light (4.66:1 on the `#F8F8F8` ground, 4.95:1 on white; lobe's `#8A8A8A` failed 4.5:1) and lobe's `#8F8F8F` in dark (6.0:1 on `#0D0D0D`).
- Words: no permanent tutorials or footnotes on working pages. A walkthrough lives in 使用指南; a calculation basis or caveat sits behind an ⓘ tooltip; one-line helpers only where an action would otherwise be ambiguous. Merge sections that show the same thing twice.
- Color signals: state reads as gray text plus a 6px dot. AI at work is the violet dot (pulsing only while it works); waiting on a person is the warning dot; a failure is the danger dot; everything settled stays gray. No filled color pills for state. `AiTaskStatus compact` already follows this (its failed state colors the words too).
- Caveats that change how a number is read (an estimate, an excluded amount) stay visible as one short tertiary line; only the long basis moves behind ⓘ.
- Lists: rows separated by hairlines, text aligned with the section title, hover as a faint neutral fill (`--lobe-color-fill-tertiary`) that may bleed 8px past the text edge.
- Console chrome (the AI 创作中心 shell, `studio-console.module.css`, through lobe's stable `lobe-dashboard-*` classes): sidebar 220px expanded on desktop, 36px nav rows (CJK labels fill the em box, so 32px rows read cramped), groups separated by 20px of space with no rules, the current page in ink text at weight 500 on `--lobe-color-fill-tertiary` with 6px radius; siblings in secondary gray. Filter and count chips (框架 / 卖点 label strip, 成片 modes) work like Linear's view tabs: one 32px line of name then count, the chosen chip in ink on `--lobe-color-fill-secondary` with a `--lobe-color-border` hairline, the rest bare secondary-gray text, and a gap reads 待补 in amber text rather than a dashed box. The chips and their note sit on one row with the scope picker (产品) at its end; chips wrap inside their own column, and below 640px the picker takes its own line. Inverted ink fills (ink on light, white on dark) are reserved for the primary action, never for a selected filter. List toolbars keep filters at their natural widths (a 260px search with the icon inside the field and Enter to submit, 160px selects) on the left and the view switch at the row's end; the count and any note sit on one tertiary line under it. Filters never stretch into equal-width grid columns, and a filter whose values the current tenant does not use (the groland 视频类型 on 原片) is not shown. A select opens straight onto its options; it shows a search field only from 9 options up (a two-product catalog never does). Toggle chips that pick a set (AI 切段 候选框架) use the same chip grammar with a ✓ on checked ones, never violet borders. A page without its own nav entry keeps its parent lit and reads parent / page in the breadcrumb, with the parent linked (原片 / AI 切段). Controls (2026-10-25): four tiers only — the primary action (inverted ink, at most one per screen), the AI action (violet `AiActionButton`, only to start AI work), the secondary action (neutral outline, ink text) and inline text actions; links are ink at weight 500 with an underline on hover, never violet. Row actions in tables are text buttons, list refresh is one quiet icon button (`RefreshButton`) beside the section title, and a table hides its pagination when there is only one page. Times, durations, money and statistics (metric tiles, shares, counts) use the body face with tabular digits (no monospace), and every duration reads in the `m:ss.s` clock of the timeline (0:48.9, 3:46.8; a limit as 10:00). Internal identifiers — preset versions, prompt versions, model self-confidence, per-call cost — live in tooltips, not row text; a preset name shows its version only when the same list holds two versions. An empty section is one centred sentence plus at most one secondary action, without a frame. The studio home has no breadcrumb, so the rule after the sidebar toggle is hidden there too. A flow-strip number counts the whole step and names its failures inside the caption (AI 切段 「18 · 10 月分析 · 5 次失败」), never a bare failure count under the step name. The home's period control (2026-10-26) sits at the header end (when it does not fit beside the title it drops under it as one right-aligned row, left-aligned below 640px, and the date field never shrinks into an ellipsis): 日 / 月 / 年 / 自定义 in a segmented control, with the dates they cover on its left (2026/10/01 - 2026/10/26) in a borderless picker between ‹ › steps (自定义 swaps them for a range picker). It opens on 日 at yesterday in Beijing time (2026-10-28), the newest complete day, even when nothing ran on it, so the first read never drifts with activity; switching to 日 / 月 / 年 lands on the day, month or year holding yesterday (on the 1st, 月 is last month); nothing after today can be picked, and period captions name the period (10 月 26 日 / 10 月 / 2026 年 / 所选时段). Live counts (可用原片, 进行中, 待确认) and 最近任务 ignore it. Cost hints come from recorded spend (AI 切段 averages the last 30 days' priced calls), with a dated default only until three priced calls exist. Video cards (原片) carry at most three lines over the cover: title, an optional platform · product · creator line (nothing when none is known, never a 待补充 placeholder) and one row of tags plus readiness pills; a single scrim darkens only the bottom half, at 0.92 under the text so burned-in subtitles cannot read through. Unchecked checkboxes draw their box in the quaternary text tone so a selection list reads before anything is ticked. 片段标注 (2026-10-25): the vertical original sits in a fixed 320px column beside one work column (new-segment form above, timeline below); on phones the frame is height-led at 42svh and keeps the video's own width. Timeline label tones cycle blue, teal, amber and rose — never violet (AI) or gray (待确认). An annotation remembers where it was opened (`from=assets` or `from=analysis`): its breadcrumb, lit nav item and back link return there (原片 / 标注片段, 原片 / AI 切段 / 标注片段), otherwise to its segment library. AI 合成 / 成片 (2026-10-25): tabs that switch the page (框架混剪 / 卖点混剪 / 单条剪辑) sit under the title as plain labels on one hairline with a 2px ink underline under the current one, never beside the title like a filter. Progress hints are numbered steps (a gray number until done, then a green check), never hollow radio-like dots. A field holding a one- or two-digit count is sized to it (120px), not to its column. A card has one primary action; the rest (以此为起点编辑, 任务详情) sit behind a ⋯ menu at the card's end, and two ways to start the same thing share one menu button (换起点 ▾) with 清空 as a text action. A 成片 batch is a job, not a video, so the list shows one batch per row (the 最近批次 grammar): up to four output thumbnails fanned like an avatar stack, product · type over the whole structure (two lines at most), then status with progress and time with the creator in fixed columns; single outputs get media cards only on the batch page. The list shows every batch in numbered pages of 20 (the 原片 pager: 共 N 个批次 at the end, hidden on a single page); the type chips count batches that still have outputs; after a hairline divider come the states across every type — 待审核 (an output waits for a person) then 未成片 (failed, cancelled or outputs deleted) — each shown only while it has batches or is open. Chip counts and page counts come from the API over the whole scope, never from the loaded rows; tab and page live in the URL so a batch's back link returns to them. Who can see the list and what the chip numbers count is an ⓘ beside refresh, not a footer or a note in the chip row. 成片审核 (2026-10-26): AI finishing an output is not done — a person's review is. A delivered output reads 待审核 in amber, 已通过 in green and 已驳回 in red (`ReviewStatus`: dot then word, the compact task-status shape); green never marks AI completion alone, and a batch reads by its outputs (待审核 while any waits, 已通过 once one passed, 已驳回 when all were rejected) with 待审核 n · 已通过 m in its meta. Each output has a review page on the 片段标注 layout (`?batch=&output=`): the vertical video in the 320px column with 下载成片 under it; in the work column the status line, AI 相近画面 hints, a 成片时间轴 that lays the segments end to end on the output's own clock in the label tones (a block plays from its first frame), the 片段来源 rows and 人工审核. 通过 is the screen's one primary action; 驳回 opens reason chips (✓ toggle grammar, at least one) and a note, and a reviewed output shows the call, reviewer and time with 改为驳回 / 改为通过 and 撤销审核 as a text action. 上一条 / 下一条 walk the batch and a 下一条待审核 link follows a decision. A one-output batch opens straight on its review page from the list; batch cards open it from the cover and their one action (去审核 while waiting, 查看 after), replacing the old play dialog. The list has no second title, its type chips lead and refresh closes the row, and 新建批次 sits in the page header. A page's own status line (`AiTaskStatus framed={false}`) carries no box. Source lineage is one aligned row per segment (label · source · interval through a subgrid). A selected item (a 剪辑台 clip) is outlined in ink on the tertiary fill; hover borders use the quaternary text tone; focus uses the focus ring — violet stays for AI. 竞品爆款 (2026-10-25, default changed 2026-10-27): with no category in the URL 爆款分析 opens on 全部品类; the category select lists 全部品类 first, then every category with films by film count (most first), and a category in the URL narrows the view. 爆款视频 rows lead with a 9:16 thumbnail of the latest analysis's opening frame (a light placeholder until one exists), the same size as the 成片 row thumbnails. Content sits in ConsoleShell's 24px padding plus 8px at the top and 40px at the bottom; side-by-side unframed columns keep at least 40px between them. Such columns also share one heading height and one row rhythm (60px rows on the studio home) so every hairline lines up with the one beside it; a column's metadata (费用估算's scope and dates) sits at the end of its heading row, never between the heading and the first rule. The groland app shell (`components/organisms/layout.tsx`) adopts the same overrides when those modules return.
- Reference implementation: the AI 创作中心 home (`ai-studio-home.tsx`, `studio-home.module.css`) and the console overrides in `studio-console.module.css`.

## Visual System Migration

- Done 2026-10-24: every page (AI 创作中心, account and admin pages, home, 素材库, dashboards, reports, DataOps, live center, marketing, sample inventory, industry news) is on lobe-ui; `antd` and `@ant-design/icons` are no longer dependencies, and their theme adapter, legacy provider, global `.ant-*` overrides and gates are gone. Execution history lives in the Trellis task `lobe-ui-visual-system`.
- One app shell: `components/organisms/layout.tsx` and the AI 创作中心 shell both render lobe `ConsoleShell` + `ConsoleNav`, with `AccountMenu` at the sidebar foot. `LobeProvider` is app-wide (`ViteProviders`).
- Shared token names: `DESIGN_TOKENS.json` (and its mirrors `lib/design-tokens.ts`, `design-tokens.css`, the ECharts fallbacks) holds v2 values, and the bridge in `aios-theme.css` re-points the shared color names on `html:root` to lobe and v2 roles so they follow lobe's theme (and dark mode): `--text-*`, `--bg-*`, `--border-color*`, `--divider-color`, `--status-*`, `--trend-*`, `--chart-series-*`; `--brand-primary` is ink, while `--brand-text`, `--brand-secondary`, and `--brand-border` are AI violet roles. These names stay as the token layer behind the Tailwind utilities, the ECharts CSS variables and `theme-provider`'s root reads; removing them would mean rewiring Tailwind, the ECharts mirror and their gates for no visible change, so the bridge is kept on purpose (decided 2026-10-24).
- Forms use `useControlledForm` (`hooks/use-controlled-form.ts`) with `FormField` (`components/molecules/form-field.tsx`); selects use `LabeledSelect`; notices `toast`; confirmations `confirmModal`.
- Pages and components write `--lobe-*` / `--aios-*` directly in CSS and inline styles; `verify:design:legacy-colors` fails on `var(--<shared name>)` outside the token layer (`design-tokens.css`, `aios-theme.css`, `echarts.css`).
- Dark reviewed signed in on 2026-10-24 (home, AI 创作中心, 素材库, dashboards, sample inventory, DataOps, admin, sign-in, recruiting); production has no groland data, so the data-heavy groland charts and tables were seen empty. Decorative accents that became violet through the v1 `--brand-*` bridge were moved to ink and the neutrals on 2026-10-24; violet stays on AI surfaces, focus and selection; links moved to ink on 2026-10-25. Ink inverts in dark, so a large ink band (the report cover spine) uses `--aios-stage` there, and a white `itemStyle.color` in a chart (a hollow mark) becomes the dark card.
- First-screen weight: `LobeProvider` passes motion's light `m` component and loads the animation features (`components/motion-features.ts`) and the toast/modal hosts (`components/lobe-hosts.tsx`, imported from the package entry so the hosts share one module instance with `toast()` / `confirmModal()`) after the first screen. Do not force lobe-ui, Base UI, or motion into vendor chunk groups; only the lobe stylesheet keeps its `vendor-lobe-ui` CSS chunk.
- Bundle: the precompiled lobe-ui stylesheet has its own strict `vendorLobeUiCssGzipBytes` budget (64 KiB); a lobe-ui upgrade that crosses the strict target is reviewed with that upgrade.

## Page Archetypes

### AIOS Product Home and Navigation (2026-10-27)

- The AIOS home (refined 2026-10-27) is the company's module directory under the persistent global navigation, without ConsoleShell or a left sidebar: a restrained two-line company headline (公司的每一项业务，在同一个 AIOS 里运转。), a one-line scope, and a quiet 浏览文档 link — no primary entry to any one module and no module workflow illustration. Below it, one hairline band per domain (the domain name in a narrow column, its modules as full-width rows: outlined icon, name, one-line summary, status, arrow), never a card wall. The directory is built from the same permission-filtered navigation as the top bar: a menu group is a domain, standalone links gather under 更多, 文档 closes the list, system settings stay off it, and only links that carry a `summary` appear; domains with connected modules lead. A module whose data is not connected in this deployment reads 未接入数据, and one that works but is held back from the company (素材库, the previous company's library, reachable by the super admin only) reads 未开放, both in tertiary text with the name in secondary; open rows carry no status label. Future domains share one line (即将接入：产品 · 人力 · 财务) with no links. Signed out, the directory is one line asking to sign in; it waits for the session check instead of flashing that line. Keep content within a 1280px reading container; on phones a domain name sits above its rows and a row stacks its summary and status under the name, and the headline breaks only between phrases.
- Supplied Linear/Vercel screenshots inform composition and restraint. Do not copy marks, invent customer logos or performance numbers, or reuse the previous decorative gradients/glows/rings and equal-weight card matrix.
- The global header is present on the home and module routes (except existing login and standalone recruiting boundaries). It owns cross-system navigation, account and appearance. AI Studio retains its local sidebar and breadcrumb; other ConsoleShell pages show only the current permission-filtered module group. Standalone pages without local destinations have no sidebar. Docs uses its own document tree and article TOC without another AIOS sidebar.
- Opening a module stays in the same tab and preserves the global navigation. Compact view offers a module menu plus account entry; it must not crowd out local navigation. Homepage and docs are independent scroll surfaces; module console height excludes the 56px global header.


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

### Public Candidate Forms

- Scope: anonymous long-form pages such as the intern online test (`/join/ai-intern`).
- Primary job: let an outside candidate read questions and write long answers calmly; no app navigation, no scores or internal rubric.
- Layout: a compact AIOS wordmark header above a single reading column (max-width 760px) on a tokenized container surface; one assignment title and three quietly separated sections: candidate information, the complete brief (task, materials, requirements, delivery) with its submission field, and AI workflow with one combined rules-and-explanation field. Candidate fields come first, labels sit above inputs, monospace (`--font-family-mono`) is only for code blocks and code inputs; one primary submit action at the end.
- Disclosure: keep assignment requirements and delivery instructions visible at body size; only optional rule-file inputs use native details. Use quiet numbered section headings. Group downloadable samples into one compact bordered file list with filename, muted duration/size and a separate download action; do not load video until requested. Retain all question wording. Use modest auto-growing textareas, readable body text and a compact metadata row.
- States: required-field errors inline, draft-saved status near the submit action, explicit submit error with a retry path, and a success result that replaces the form.
- The reviewer side (`/admin/recruiting`) follows the Admin Pages archetype: table list plus a task drawer with a sticky scoring column.

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
- Asset cards may include cover imagery and inline video preview, but playback controls must stay quiet and task-oriented: single-layer play affordance (a 44px disc of `--aios-stage` at 48% with a filled `--aios-stage-text` triangle, no ring, glass or shadow, the same in both themes; 64% on hover), visible loading/error state, default muted playback, and an explicit mute/unmute control when media is active.
- Card media interactions must not conflict with route navigation. Play, mute, download, and detail actions require distinct hit targets, visible focus states, and event boundaries so users can preview without accidentally opening the detail route.
- Detail pages should reuse the same white/gray/blue console language as the list page, with profile, transcript, AI analysis, platform mapping, and ad-material mapping grouped by workflow state rather than campaign-style storytelling.
- Content asset module labels, queue counts, media duration, file sizes, and platform IDs should use tabular/mono treatment where numeric scanning matters; free-text transcript and AI summaries stay in normal UI typography for readability.

### Content Hub / Live Center Pages

- Primary job: organize content operations under the top-level 内容中台 navigation while keeping 素材库, AI 创作中心, and 直播中台 as focused secondary workbench entries. 素材库 owns asset management; AI 创作中心 (`/content/ai-studio/*`) owns production (analysis, segments, editing, outputs, competitor hits) on the same asset truth. It is the first Visual Language v2 surface: lobe `ConsoleShell` with `ConsoleNav` (an untitled group 首页 / 原片 / 成片, then the AI 剪辑 and 竞品爆款 groups, then 团队 only for accounts that may open 团队产出), a breadcrumb; the shared account menu lives in the persistent AIOS top bar.
- AI 创作中心 segment lists are one grammar in two routes: 框架片段 (`/content/ai-studio/segments`) and 卖点片段 (`/content/ai-studio/selling-points`) each fix the list to one preset kind and share the same segment library table, filters, bulk bar, and annotation entry. A selling-point row may add its framework-segment reference and the 连着 marker inside the existing row layout; neither route introduces its own visual pattern.
- AI 创作中心 竞品 statistics (rankings on 爆款分析) use one share-bar grammar: a ranked list per dimension card with a single Chart Series 1 bar, a fixed right-aligned tabular `x/n · %` column (or the money a ranking sorts by), and the denominator plus excluded counts stated under the card title. Below the small-sample threshold the percentage is dropped and only `x/n` shows; there is no legend, no multi-color bar, and text never takes the series color. A row opens its example films inline; free-text dimensions without a dictionary render as count chips, never as bars.
- 竞品爆款 · 爆款分析 (`/content/ai-studio/competitor`, first in the 竞品爆款 nav group before 爆款视频; the retired 爆款打法 address `/content/ai-studio/patterns` redirects here with its query) is, since 2026-10-27, the filter row, 爆款拆解 (since 2026-10-29), then 框架结构排行 and nothing else (the metric row, opening frames, the full hook / selling-point / opening-path rankings, scene / audience chips and the 爆款共性 cards are retired). 框架结构排行 (since 2026-10-27 evening) shows one lane at a time, picked by a `Segmented` 框架结构 / 卖点结构 above the list (`lane` in the URL): 框架结构 is the framework segments' labels in time order, adjacent repeats merged, joined by →; 卖点结构 is the set of selling-point labels a film states, in preset order, joined by +. Each label sits after a small square in its 片段标注 tone with neutral text, and rows wrap rather than truncate. Every row is one structure with three columns under a hairline heading (结构 / 竞品 · n 条 / 我方): the competitor share bar in Chart Series 1 on the left, its figure `x/n · % · m 个品牌`, and our side in Chart Series 2 on the right; on a phone the name takes its own line and each side is labelled inline. Since 2026-10-29 our side waits for 视频云管家 spend summed over the window (P2): until then it shows — and the lane row says 我方数据将在视频云管家接入后，按这段时间的消耗统计. Under 按视频条数 a 结构要素 block comes first, because exact sequences scatter: the same three-column rows grouped under tertiary titles 包含 / 开头 / 结尾 / 长度 (for selling points 包含 and 长度), each element named 含街采, 开头是机制, 4 段及以上 or 3 个卖点; then 完整结构 lists the exact sequences. Marks read in amber text after a name only when we have at least ten originals in the lane: 我方偏少 for an element where competitors are at least 常见 (a third of the films) and our share is under half theirs, 我方没有 for an exact structure in at least 10% of the window's films from two or more brands where ours is zero (an original with it but no spend in the window counts as zero); with fewer originals the caption says the difference is for reference only. Structures only we have close the list with 竞品 —. With no original of ours in the lane, the row of the lane switch says so and links to 框架片段 / 卖点片段. The first ten rows show with 展开全部 N 种. One `Segmented` at the heading row's end sorts the list: 按视频条数 (films, a re-posted material counted each time, with the brands behind them; x/n and no percentage below ten films, ours likewise below ten originals) or 按直播间销售额 (罗盘 live-trade bands summed over the rooms a structure's films drove traffic to in the window, each room-day once, ranked by the lower bound and shown as ¥150万–325万 or ¥150万+ for an open top band; rooms and days in the row tooltip; structures without 罗盘 sales leave this order; our side shows — since we have no sales). The sort lives in the URL (`sort=sales`); a caption under the heading states the unit, and for sales that it is the rooms' amount rather than what a film sold, plus how many films have 罗盘 data. Counts follow the snapshot scope: the latest finished analysis per film, its card category, the Beijing first-seen date. The filter row is the category select then the studio home's period control (日 / 月 / 年 / 自定义, the covered dates between ‹ ›, opening like the home on 日 at yesterday); 较上一周期 compares with the previous day, month or year, or as many days before a custom range. A window with films but no locked statistics yet reads 框架结构统计还在生成 and refreshes itself; an empty window says so at once. The 竞品拆解 drawer (2026-10-26, refined 2026-10-27) reads 推广产品 and the status line, then 拆解概要 (the summary as body text with no label, then 打消的顾虑), then 框架结构 on the 片段标注 timeline grammar: a 框架 lane and a 卖点 lane (overlapping selling points take extra rows) over the ruler, which sits under the blocks like an editor's track, and the 卖点 counts as the legend under it (tone, name, ×n); blocks in the label tones show names only, and a block under 6% of the film shows its tone alone; times live in the tooltip and once in the picked block's heading, never beside every label. A failed selling-point call keeps the framework and the transcript, says so in the 卖点 lane and offers the re-run. 原片与口播 follows: the player beside 口播转写, the whole timed transcript with each line's framework segment as a tone bar on its left edge (it is machine transcription, named as such, never 脚本). Nothing is picked at first; picking a block lights its lines on the tertiary fill, steps the rest back to secondary text, scrolls the list to them and shows a selling point's quote, and 全部 (or a second click) clears it. The sample frames close the drawer as evidence. Audit detail — validation notes, model and dictionary versions — stays out of the reading surface (the model sits in the timestamp tooltip); a partial card says once what was removed.
- 竞品爆款 · 爆款视频 (`/content/ai-studio/trends`) uses the same `StudioPeriodControl` as 爆款分析, beside 全部来源 / 罗盘榜单 / 手动添加, opening like the home on 日 at yesterday. Compass membership follows the ranking day; manual membership follows the first manual collection day in Beijing time. ALL is their unique-film union; a removed compass-only record remains as 历史收录 by its first collection date. The list shows the server total, 20 films per page (pager hidden for one page), latest sync/ranking dates, and in-window ranking days / explicitly labelled live-room rank. URL filters/page survive opening and closing an analysis. Re-pasting a film reports 已存在 and preserves metadata and existing analysis; 编辑资料 is the explicit metadata action. An incomplete or failed analysis requires a separate retry; complete/active results are reused. The full-width list, header-level add action and link-first modal remain the layout authority; phone cards preserve the same catalog actions.
- 爆款分析 · 爆款拆解 (2026-10-29, semantic openings v1 / reading v13) sits below the filters as three unframed blocks separated by hairlines: 开头 3 秒怎么说, 在什么场景解决什么痛点, 谁在背书. Opening rows show only a reusable natural-language formula with [变量] and a right-aligned `x/n 条 · m 个品牌` count. Group by concrete meaning and persuasion logic even when wording or style differs; broad labels or shared keywords alone are insufficient. Do not show a raw quotation, example line, mechanism tags or hook-reading subtitles under a formula. Formula jobs are independent of the optional 生成拆解 reading: a writer viewing a populated scope requests the input/prompt-version cache automatically; show pending, empty and failure states, and retry failed jobs only through an explicit action. Old or failed results never fall back to raw text as formulas. The top five formulas are shown; uncertain sources remain accessible under 尚未归类的开头. Clicking a formula opens all distinct source videos, with five per page and an explicit range/total: retain each source's opening text, 口播 / 画面文字 provenance and available time intervals. Never deduplicate these sources by opening family or cap them at the sales TOP5. The drawer is 560px on desktop and full width on phones; it keeps the cover, title, analysis/original links and sales-band caveat. Scene rows retain 场景 → 痛点 → 卖点, audience tags and a quote; endorser rows retain named people/roles, 未具名 and 其他背书. These two blocks retain the existing sales TOP5 drawer. Counts are computed by the host over the selected window, including reposted video IDs; the model never writes the counts. The optional 生成拆解 action retains the ten-film threshold and estimate, adds scene/endorser readings, 黄金结构 and at most three 下一条怎么拍 actions, reusing current semantic formulas when available. Reading failure does not hide independently generated opening formulas. Pending/failed/stale reading states and the no-performance-data caveat remain visible.
- AIOS global navigation (2026-10-27, refined the same day) sits in a quiet 56px top bar above module sidebars, on the page background with no bottom rule: the solid AIOS mark at the left, the product groups centered on the whole bar (看板, 报告, 内容中台, 营销, 文档, then the remaining permission-aware destinations under 更多), the account at the right. Group labels are 14px like the module sidebars, never smaller than the level below them; only 更多 carries a chevron, and a group opens on hover or click into a menu sized to its labels (36px rows, every destination with its icon). The current group reads in ink at weight 500 on the tertiary fill, the hover state's neutral fill, never a colored pill. From 900px down the groups follow the brand instead of centering; under 760px they become one 切换模块 menu with 44px targets. 内容中台 lists only AI 创作中心 for every account except the configured super admin, who also sees 素材库 and 直播中台 (route kind `super_admin`, 2026-10-27); pages inside AI 创作中心 never link to 素材库 or name it (2026-10-28): the company's own originals come from the 云视频管家 API, so 原片 is the studio's library and copy says 已删除 / 没有可播放的文件 rather than 从素材库删除 / 未关联素材库资产. Module workspace cards and their sidebar brand rows start 12px under the bar; a module sidebar's mark is outlined (ink glyph on the container color with a hairline) so it never repeats the solid AIOS mark. Login has no console chrome. The studio brand leads to its own home; the AIOS mark leads to the full-width product home. The top bar stays visible on scroll; account and appearance controls live at its right edge. Console height excludes the bar so its internal scrolling still fits the viewport. The BQL profile exposes the complete navigation and static docs, while data-dependent modules explicitly state 尚未接入百雀羚数据 and do not mount legacy data clients.
- 团队 · 团队产出 (`/content/ai-studio/team-output`, 2026-10-29) is a manager view, hidden from everyone without `marketing:team_output:read`. It follows the studio home: the title with the period control at the header end (opening on 月 holding yesterday, because output is read by month), then one toolbar row — a `Segmented` 剪辑 / 编导 (in the URL), the 品类 select (160px, 全部品类 first) and an ⓘ with the counting basis. Under it at most two tertiary lines: freshness (数据更新到 10/28, an amber dot and the days not complete when any are missing) with the source caveat 巨量千川投放，云管家原值，成交不扣退款, then the caveats that change a reading (未标注编导 n 条 · 多人编导 n 条，每人都计入 · 消耗没有成交数据 · 巨量广告、百度等其他平台消耗 ¥x 未计入). Money is named by its platform (千川消耗, 千川成交), never a bare 消耗. The totals strip uses the home's chain-strip frame with four figures (成片数, 千川消耗, 千川成交, ROI, each with its 新片 or 有消耗 caption). The table is hairline rows, team → group → person, with right-aligned tabular figures; team rows are 500 ink and fold, group rows secondary, people indented with their role in tertiary; 未关联账号 / 未归属 come last and list people directly. Column hints live in tooltips. A person's name is an ink text action that opens a 720px drawer (full width on phones) with their 成片: name and a tertiary meta line (date, 以前上传, 品类, 状态, 编导, 剪辑, ID, 其他平台 ¥x 未计入 when any), exact amounts, ROI and the cumulative 累计消耗. No ranking, score or color for good or bad.
- 爆款视频 intake (2026-10-27) is an occasional action: the list spans the workspace and a single ink 添加视频 button opens the existing lobe Modal (560px desktop, viewport-contained on phones). The required share link leads; 品牌 / 品类 / 备注 live behind 补充信息. Only 添加并分析 uses violet; 仅添加 is neutral. The cost estimate stays beside the submission area. Closing preserves the draft, failure retains inputs, pending submission prevents duplicate requests and dismissal, and closing returns focus to the trigger unless the analysis drawer takes over. Success clears the draft only after the requested action is acknowledged.
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
- 2026-10-24: the owner approved Layout Grammar v3 (untinted gray, one container layer, lighter weights, dot signals) after reviewing the AI 创作中心 home in both themes.
- 2026-10-23: the owner approved the evolution to Visual Language v2 (lobe-ui 6 + Base UI, ink plus AI violet, light and dark). 2026-10-24: every page is on v2 and Ant Design is removed; the v1 sections are gone and the shared token names carry v2 values.
- The executable guard is `npm run verify:frontend:design-evolution`; the paired behavior fixture is `npm run verify:frontend:design-evolution-behavior`.
- If the guard fails, do not bypass it by weakening route classification. Either update this authority document to describe the new visual grammar, or keep the implementation inside the current design contracts.

## Typography System

- AIOS uses a three-layer font system: UI, Display, and Mono/Data. Do not introduce page-only font families without adding a documented role here.
- UI and Display (`--font-family-base`, `--font-family-display`, `--aios-font-ui`) for Chinese UI, dense dashboards, tables, filters, forms, product names and headings:
  `"Geist Variable", -apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif`.
- Mono/data (`--font-family-code`, `--font-family-mono`, `--aios-font-data`) for KPI values, currency, percentages, IDs, timestamps, SQL, logs, and trace IDs:
  `"Geist Mono Variable", "SF Mono", ui-monospace, Menlo, Consolas, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", monospace`.
- Geist draws Latin and digits. Chinese uses PingFang SC on Apple systems; elsewhere (Windows) it uses HarmonyOS Sans SC, the CJK face lobe-ui ships, before Microsoft YaHei. Geist and Geist Mono are self-hosted through `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (OFL). HarmonyOS Sans SC is the one CDN font (owner decision 2026-10-24): `lobe-provider.tsx` passes only `@lobehub/webfont-harmony-sans-sc` from `registry.npmmirror.com` to lobe's `customFonts`, appended after the first render with `font-display: swap`, so Windows shows Microsoft YaHei until it arrives and macOS never fetches the files. lobe's other CDN fonts stay off; add no other CDN font. Do not use Nerd Font glyphs as product UI icons.
- Runtime enforcement: CSS Modules must consume font families through `var(--font-family-base)`, `var(--font-family-display)`, `var(--font-family-mono)`, or `inherit`. Do not paste local stacks such as `"Geist Mono", ...` or `"Courier New", monospace` into page-level CSS.
- Runtime enforcement: CSS Modules must not introduce new raw `font-size`, `line-height`, or `letter-spacing` values. Existing legacy raw declarations are frozen in `scripts/css-module-typography-allowlist.json`; new and refactored declarations should use `--font-size-*`, `--line-height-*`, and `--letter-spacing-*` tokens.
- Letter spacing tokens: `--letter-spacing-normal` for ordinary UI text, `--letter-spacing-label` for short uppercase KPI/metadata labels, `--letter-spacing-eyebrow` for rare English eyebrow/kicker labels, `--letter-spacing-tight` for page titles, `--letter-spacing-title` for section titles, and `--letter-spacing-data` for mono/tabular KPI values.
- Line-height tokens: `--line-height-none` for large single-line numbers, `--line-height-zero` only for structural collapse rows such as table measure rows, `--line-height-compact` for dense chart labels, `--line-height-snug` for badges/meta labels, `--line-height-tight` for compact headings, `--line-height-normal` for ordinary UI, `--line-height-relaxed` for paragraphs, and `--line-height-prose` for long markdown/reference-document reading.
- Control geometry line-height tokens: use `--component-control-line-height-xs|sm|md|lg` only when a third-party control needs fixed pixel line-height for vertical centering inside a fixed-height Pagination, Select, icon expand control, or small action button. Do not use these tokens for prose, labels, KPI values, or ordinary text rhythm.
- Runtime enforcement: CSS Modules must stay focused. New `*.module.css` files should stay under 800 lines; existing oversized legacy modules are frozen in `scripts/css-module-size-allowlist.json` and may not grow. Split by page section, component, or domain concern before adding more styles to those files.

### Type Scale Contract

Use this scale before inventing a page-local size. Dashboard pages should rarely exceed the page-title and data-large sizes; home/marketing shells may use the marketing display sizes only for first-screen orientation.

| Role | Size | Weight | Line height | Tracking | Font | Runtime / Tailwind / component mapping | Usage |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Tiny label | 11px | 520 | 1.25 | 0 | UI | `--font-size-xs`, `text-xs`, `Typography caption` | badges, axis labels, dense table hints |
| Label | 13px | 500 | 1.4 | 0 | UI | `--font-size-md` | sidebar group names, stat and chip labels, form labels on dense consoles |
| Meta | 12px | 520 | 1.35 | 0 or `--letter-spacing-label` for short uppercase labels | UI | `--font-size-sm`, `text-sm` | metadata, helper text, table hints, compact filters |
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

The shared token names carry these v2 values (light theme; dark values come from lobe and `aios-theme.css` through the bridge). Roles and rules are in [Visual Language v2](#visual-language-v2) › Color Roles.

| Token | Value | Role |
| --- | --- | --- |
| `--bg-global` / `--bg-subtle` / `--bg-hover` | `#F8F8F8` | page canvas, quiet fills, hover wash (lobe gray layout) |
| `--bg-card` | `#FFFFFF` | cards, tables, popovers, drawers |
| `--text-primary` | `#1F1F1F` | titles, core values |
| `--text-secondary` | `#666666` | body, labels, table text |
| `--text-tertiary` | `#707070` | metadata, axis labels, units, hints (AA on the ground; lobe light is overridden) |
| `--text-disabled` | `#B0B0B0` | disabled controls only |
| `--border-color` / `--divider-color` | `#E3E3E3` / `#EEEEEE` | structural lines / grid and separators |
| `--brand-primary` | `#222222` (ink) | human primary action fill; text on it is white |
| `--brand-text` | `#5B45B8` | links, selected text (AI violet 11) |
| `--brand-secondary` / `--brand-border` / `--brand-bright` | `#F4F0FE` / `#D4CAFE` / `#AA99EC` | AI violet soft fill, border, small accent |
| `--status-success` / `-warning` / `-danger` / `-info` | `#168A3A` / `#B87503` / `#C93A32` / `#0060CC` | status text, always with a label; fills from lobe `*-bg` / `*-border` |
| `--trend-up` / `--trend-down` | `#D9363E` / `#13A05A` | business deltas (red up, green down) |

- Platform legend colors are category/brand exceptions for platform charts only: Tmall `#EC5E2A`, Douyin `#000000`, Xiaohongshu `#FF2442`, Kuaishou `#FF3C21`, JD `#DA291C`, WeChat `#07C160`, unknown `#8A8A8A`. Douyin `#000000` is allowed only as a platform marker.
- Success green is system state, trend-down green is a business delta, WeChat green is platform identity; a green in a chart or badge names which role it is.
- Banned: neon gradients, pure black outside the Douyin marker, rainbow palettes for ordinary dashboards, a second primary accent beside ink and AI violet, and local hex values when a token fits.

## Chart Series Palette

Ordinary multi-series charts use the v2 series in fixed order, validated for color-vision deficiency on light and dark: `--chart-series-1..5` = violet `#6E56CF`, teal `#0E9C8E`, amber `#C76E12`, blue `#2F6FE0`, rose `#C2417A`; `--chart-series-6` and `--chart-series-muted` = `#A8A8A8` (previous period, benchmark, "other"); `--chart-series-highlight` = `#6E56CF`.

- Legend text stays neutral (`--text-secondary`); only markers and swatches carry series colors.
- Single-metric charts use Series 1. Current vs previous: current Series 1, previous Muted (dashed line or low-opacity bar).
- A 7th series folds into "other" or small multiples; never generate a hue.
- Platform charts use platform colors, trend/waterfall charts trend colors, status distributions status colors, business taxonomies the domain palettes below.

### Chart Rendering

Pick the lightest renderer that does the job (decided 2026-10-24):

| Tier | Use for | Renderer |
| --- | --- | --- |
| Hand-written | metrics, share and rank bars, sparklines, free-text count chips | HTML / CSS / SVG on `--lobe-*` / `--aios-*`; Base UI only for interaction (Tooltip, buttons) |
| Standard charts | area, multi-series bar, donut without large data | `@lobehub/charts` (Recharts, same design system); add the dependency with its first real caller |
| Heavy analysis | large data, sankey, funnel, dual axis, heatmap | ECharts, as on the dashboards and reports (canvas, adapted through `lib/echarts-appearance.ts`) |

- AI 创作中心 ships no ECharts. Hand-written charts follow the theme on their own and carry a readable text equivalent.
- Charts a model proposes go through the chart spec (`app/content/ai-studio/_lib/chart-spec.ts`): kinds `stat`, `rank`, `words`; a spec names statistics by `stat_id` (`cohort:dimension:label`) and never carries a number. The renderer reads numerator and denominator from the snapshot and drops ids it cannot find; a malformed spec is rejected whole. The hand-built 框架结构排行 reads the snapshot's `structures` directly and is not a spec kind.

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
| Summary | `#8A8A8A` | `#505050` | `#F3F3F3` | `#B0B0B0` | 汇总行、总览 badge |
| L1 | `#1854BC` | `#17489F` | `#F4F7FC` | `#ADCAFB` | 一级来源/渠道，最强层级 |
| L2 | `#2F6FE0` | `#235ABC` | `#F4F7FC` | `#C5DAFE` | 二级来源/渠道，中间层级 |
| L3 | `#81ABF3` | `#3766B8` | `#F4F7FC` | `#DBE7FC` | 三级来源/渠道，最轻层级 |

- L1/L2/L3 are business hierarchy levels, not warning/info/success states.
- Do not remap L1 to warning, L2 to info, or L3 to success.
- Default three-level traffic hierarchy runs deep-to-light on one hue (OKLCH H261, the v2 series-4 blue): `#1854BC -> #2F6FE0 -> #81ABF3`, about 0.1 OKLCH lightness apart. Summary is a gray neutral, not a fourth blue.
- If a four-level hierarchy is needed in a future table/chart, insert `#2462CE` between L1 and L2: `#1854BC -> #2462CE -> #2F6FE0 -> #81ABF3`.
- In traffic tables, hierarchy color may tint the first cell, badge, left accent line, or row hover. Regular cell text stays neutral.

### Goods TOPSIS Quadrant Palette

| Quadrant | Text | Soft bg | Border | Usage |
| --- | ---: | ---: | ---: | --- |
| Star / 明星 | `#BF3D2F` | `#FFF1EF` | `#F2C4C0` | 高综合评分、高优先级商品象限，沿用上涨红 |
| Stable / 稳定 | `#235ABC` | `#F4F7FC` | `#C5DAFE` | 稳定贡献、持续经营商品象限 |
| Opportunity / 机会 | `#9B4595` | `#FCF3FA` | `#E5C6E1` | 有提升空间或潜力商品象限 |
| Long Tail / 低效尾部 | `#2F8C5B` | `#ECF8F1` | `#BFE8CA` | 低效尾部、低频、观察商品象限，沿用下跌绿 |
| Neutral / 未分类 | `#8A8A8A` | `#F8F8F8` | `#E3E3E3` | 缺失、未知、默认分类 |

- TOPSIS quadrant colors are ranking/category semantics. Star and Long Tail intentionally mirror trend-up red and trend-down green for commerce readability, but they remain quadrant colors rather than generic trend labels.
- Scores and rankings use neutral or mono typography first; quadrant colors should appear as chip, dot, border, or subtle background.
- Opportunity is plum because the v1 steel blue could not be told from Stable even with full color vision (OKLab ΔE 8). Plum clears Star and Long Tail, its 2×2 neighbours, and sits only in the CVD floor band against Stable, its diagonal; quadrant chips always carry their text label.
- Do not extend trend colors to Stable or Opportunity. Trend colors remain reserved for deltas outside the Star / Long Tail quadrant convention above.

### Funnel Stage Palette

| Funnel role | Color | Soft bg / track | Text on fill | Usage |
| --- | ---: | ---: | ---: | --- |
| Track | `#C5DAFE` | `#F4F7FC` | N/A | funnel background track |
| Stage 1 / Exposure | `#98BBF8` | `#F4F7FC` | `#1F1F1F` | exposure/top-of-funnel |
| Stage 2 / Click or Visit | `#6397F1` | `#EAF1FC` | `#1F1F1F` | click, visit, enter |
| Stage 3 / Intent | `#2F6FE0` | `#EAF1FC` | `#FFFFFF` | cart, favorite, consult, intent |
| Stage 4 / Conversion | `#1854BC` | `#F4F7FC` | `#FFFFFF` | pay/conversion endpoint |
| Connector | `#E3E3E3` | N/A | N/A | funnel connector and guide lines |

- Funnel stages are sequential flow semantics. The blue ramp belongs to funnel geometry, not info/status color. The ordered domain palettes (traffic levels, funnel, creator levels) stay single-hue blue ramps next to v2 series 4; AI violet is not used for business hierarchies.
- Text on a stage fill reaches 4.5:1: ink on the two light stages, white on the two deep ones.
- Use the deep blue only at the conversion endpoint or hover/selected bar, not for normal text outside the funnel graphic.
- Funnel side labels and percentages should stay neutral unless rendered inside a filled funnel bar.

### Creator Level Palette

| Creator level | Gradient from | Gradient to | Chip bg | Text | Usage |
| --- | ---: | ---: | ---: | ---: | --- |
| S | `#17489F` | `#1854BC` | `#DBE7FC` | `#17489F` | top-tier creator level |
| A | `#1854BC` | `#2F6FE0` | `#DBE7FC` | `#1854BC` | strong creator level |
| B | `#2F6FE0` | `#6397F1` | `#EAF1FC` | `#235ABC` | mid creator level |
| C | `#6397F1` | `#ADCAFB` | `#EAF1FC` | `#3766B8` | developing creator level |
| D | `#ADCAFB` | `#DBE7FC` | `#F3F3F3` | `#666666` | entry/long-tail creator level |

- Creator levels are rank taxonomy, not status health.
- Creator level color must run deep-to-light by rank on the same H261 blue ramp instead of mixed status colors; D (entry) drops to a gray chip with secondary text.
- Use gradients for level distribution bars or radial marks. Use filled chip bg + text for table and form chips; visual borders should stay transparent.
- Detail table text remains neutral; only the level chip/marker carries the level color.

### Cooperation Stage Palette

| Cooperation stage | Text | Chip bg | Usage |
| --- | ---: | ---: | --- |
| Unclassified / `-` | `#666666` | `#F3F3F3` | unknown/default |
| Initial contact / 初期建联 | `#235ABC` | `#DBE7FC` | first contact |
| Sample negotiation / 试样洽谈 | `#8F5E02` | `#FFF0C7` | sample or negotiation |
| Not considering / 暂不考虑合作 | `#A65F3E` | `#FFE4DD` | rejected/not considering |
| Paused / 合作暂停 | `#9F3D35` | `#FFE1DE` | paused workflow |
| Live started / 已合作开播 | `#0F6F2E` | `#DFF5E7` | completed cooperation workflow |

- Cooperation stages are creator workflow taxonomy. They may resemble status colors but are scoped to cooperation workflow only.
- Use stage colors for flow nodes, filled stage chips, filter chips, and stage-specific chart segments.
- Do not use these colors for generic success/error/warning UI outside cooperation workflows.

## Runtime Token Mapping

| Role | CSS variable (pages, components) | Tailwind utility (shared name) | ECharts / code |
| --- | --- | --- | --- |
| Primary action fill | `--lobe-color-primary` | `bg-brand-primary` | selected/highlight fill only |
| AI text on light | `--aios-ai-text` | `text-brand-text` | AI labels, selected tab text on AI surfaces, small AI icons (not links) |
| Text on ink fill | `--lobe-color-bg-container` | `text-brand-on-primary` | required on ink fills (inverts with the theme) |
| Primary text | `--lobe-color-text` | `text-text-primary` | headings, primary labels |
| Secondary text | `--lobe-color-text-secondary` | `text-text-secondary` | axis/body labels |
| Tertiary text | `--lobe-color-text-tertiary` | `text-text-tertiary` | helper text, metadata |
| Border | `--lobe-color-border` | `border-border-color` | grid/axis line |
| Hover / emphasis border | `--aios-border-hover` | `border-border-color-hover` | hovered rows, inputs, dividers that need weight |
| Divider | `--lobe-color-border-secondary` | `border-divider-color` | chart split line |
| Chart series 1 | `--aios-chart-1` | N/A | ordinary primary metric series |
| Chart series 2-5 | `--aios-chart-*` | N/A | ordinary multi-series charts |
| Chart muted | `--aios-chart-muted` | N/A | previous period / benchmark |
| Chart highlight | `--aios-ai-9` | N/A | selected / hover point or bar only |
| Success status | `--aios-status-success` | `.status-badge-success`, `.status-panel-success` | status only |
| Warning status | `--aios-status-warning` | `.status-badge-warning`, `.status-panel-warning` | status only |
| Danger status | `--aios-status-danger` | `.status-badge-danger`, `.status-panel-danger` | error/destructive only |
| Info status | `--aios-status-info` | `.status-badge-info`, `.status-panel-info` | info only |
| Neutral status | `--lobe-color-text-tertiary` | `.status-badge-neutral`, `.status-panel-neutral` | empty/muted state |
| Trend up | `--aios-trend-up` | `text-trend-up` | business upward delta |
| Trend down | `--aios-trend-down` | `text-trend-down` | business downward delta |
| Trend neutral | `--lobe-color-text-tertiary` | `text-trend-neutral` | unchanged/missing delta |
| Tmall legend | `--platform-tmall` | `text-platform-tmall` | `apps/web-vite/src/lib/platform-colors.ts` |
| Douyin legend | `--platform-douyin` | `text-platform-douyin` | `apps/web-vite/src/lib/platform-colors.ts` |
| Xiaohongshu legend | `--platform-xiaohongshu` | `text-platform-xiaohongshu` | `apps/web-vite/src/lib/platform-colors.ts` |
| Kuaishou legend | `--platform-kuaishou` | `text-platform-kuaishou` | `apps/web-vite/src/lib/platform-colors.ts` |
| JD legend | `--platform-jd` | `text-platform-jd` | `apps/web-vite/src/lib/platform-colors.ts` |
| WeChat legend | `--platform-wechat` | `text-platform-wechat` | `apps/web-vite/src/lib/platform-colors.ts` |
| Unknown platform legend | `--platform-unknown` | `text-platform-unknown` | fallback platform marker via `apps/web-vite/src/lib/platform-colors.ts` |
| Domain taxonomy | `--domain-*` | `.domain-chip-*`, CSS Modules | `apps/web-vite/src/lib/domain-taxonomy-colors.ts` |
| Material layer | local `--*-material-*` | CSS Modules only | dashboard/creator module aliases |

On v2 surfaces, UI primitives come from lobe (`--lobe-color-text*`, `--lobe-color-bg-*`, `--lobe-color-border*`, `--lobe-color-fill-*`, `--lobe-color-primary` for ink, `--lobe-border-radius*`, `--lobe-box-shadow*`) and AIOS roles from `aios-theme.css` (`--aios-ai-*`, `--aios-stage*`, `--aios-status-*`, `--aios-trend-*`, `--aios-chart-*`, `--aios-font-*`). Tailwind utilities resolve through the shared names, which the bridge points at these same roles, so both columns follow the theme.

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
| `apps/web-vite/src/styles/aios-theme.css` | Visual language v2 token source | AI violet scale and roles, AI sweep, media stage, status text, trend and chart v2 values in light (`html:root`) and dark (`html:root[data-theme='dark']`) blocks, plus the legacy-token bridge on `html:root`. | Page-local materials, lobe primitive overrides beyond fonts and focus ring, or component-specific raw colors. |
| `apps/web-vite/src/lib/design-tokens.ts` | Static token mirror | Token values mirrored from `DESIGN_TOKENS.json`. | Manually invented component-local colors or values outside this document. |
| `apps/web-vite/src/lib/platform-colors.ts` | Platform legend color source | Platform legend and marker colors for Tmall, Douyin, Xiaohongshu, Kuaishou, JD, WeChat, and fallback platform markers. | Buttons, generic UI color, status color, trend color, or layout decoration. |
| `apps/web-vite/src/lib/domain-taxonomy-colors.ts` | Domain taxonomy color source | Traffic hierarchy, TOPSIS quadrants, funnel stages, creator levels, cooperation stages, and ordinary chart series aliases. | Generic status, platform, trend, or page-local material colors. |
| `apps/web-vite/src/styles/echarts-theme.ts` | ECharts token adapter | Chart theme constants, token-backed fallbacks, gradients, reusable chart helper materials, and the canonical TS values consumed by `apps/web-vite/src/theme/echarts-theme.ts`. | Page-specific chart category colors, duplicate platform/domain maps, or raw literals that should live in token/platform/domain sources. |
| `apps/web-vite/src/styles/echarts.css` | ECharts CSS adapter | ECharts CSS custom-property defaults and raw fallback values centralized only as `--echarts-fallback-*`; fallback values and exposed `--echarts-platform-*` / `--echarts-color-*` aliases must map back to documented platform, chart, text, and divider tokens. | Page-local CSS colors, one-off component styling, raw colors outside fallback declarations, or a second platform/chart palette source. |
| `apps/web-vite/src/lib/echarts-appearance.ts` | ECharts dark adapter | Light-to-dark pairs of chart token colors (text, lines, soft surfaces, series, trends, and surface-only white, tooltip and shadow values); chart wrappers apply it in dark mode because canvas cannot follow CSS variables. | New chart colors or page-specific categories, which belong in the token, platform or domain sources. |
| `apps/web-vite/src/app/dashboard/creator/_components/creator-chart-colors.ts` | Creator chart color source | Creator chart text, structural, material, tooltip, level, and platform semantics grouped by role. | Generic AIOS UI colors, ordinary page styling, or values that should live in shared token/domain/platform sources. |
| `apps/web-vite/src/app/dashboard/_components/dashboard-token-aliases.css` | Dashboard runtime token source | Dashboard-local material primitives, translucent surfaces, shadows, and runtime aliases that must ship in production dashboard CSS. | Generic AIOS UI colors, new chart palettes, or values that should live in global design tokens, platform colors, or domain taxonomy colors. |
| `apps/web-vite/src/app/page-materials.css` | Legacy homepage material source | Retained historical homepage-local material primitives; the current home no longer imports these styles and uses shared runtime tokens in `_components/home-page.module.css`. | New homepage palettes, live metrics, console navigation or duplicated global tokens. |

## Motion Language

- Motion principle: functional and restrained. AIOS should feel stable, not theatrical.
- Default duration: 150ms for hover/focus, 250ms for panel/card transitions, 350ms only for drawer/modal entrances.
- Default easing: `cubic-bezier(0.4, 0, 0.2, 1)`.
- Hover: use color, border, background, or slight shadow changes. Avoid large movement.
- Active: tactile feedback may use `translateY(1px)` or `scale(0.98)` for buttons only.
- Focus: visible neutral ink focus (`--lobe-focus-ring-color`), never remove keyboard focus. Native fields use the base ring; lobe Input, Password, InputNumber and TextArea delegate focus and validation to their outer root. Exclude their stable native-child classes from the base ring so normal and invalid focus never draw an inner rectangle. AI violet indicates AI work, not generic typing. Filled (the Dark default) and borderless fields use the same single neutral outer focus recipe in `aios-theme.css`; disabled and invalid roots are excluded. Error focus retains the component error treatment.
- Loading: skeletons that match the final layout; no generic full-screen spinner when a scoped skeleton is possible.
- Reduced motion: disable transform-heavy transitions under `prefers-reduced-motion: reduce`; keep opacity/color changes acceptable.
- v2 AI motion: persistent motion exists only while AI works (sweep, thinking pulse, streaming text) and stops with it; see [Visual Language v2](#visual-language-v2) Motion.
- Banned motion patterns: custom cursors, looping decorative animations on dashboards, parallax in operational pages, animating width/height/top/left, and hover glow effects.

## Component Grammar

> Base grammar; [Visual Language v2](#visual-language-v2) (Components and AI Grammar) wins where the two disagree.

- Layout: max-width constrained content, grid-first composition, 8px spacing rhythm. Dashboard density can be high but must remain scannable.
- Cards: use cards only when they group a task or dataset. Prefer subtle borders and white/near-white surfaces over heavy shadows.
- DeepSeek-like metric rows: important KPI groups may be unboxed and separated by whitespace; not every metric needs a card.
- Buttons: primary uses the ink fill (lobe `type="primary"`) with white text, and an action that starts AI uses `AiActionButton`; secondary uses white/outline; danger uses explicit danger only for destructive actions. Radius 6-12px depending on size.
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
- Forbidden deviations: introducing an accent beyond ink and AI violet, using an alternate legacy blue as a shadow primary, using pure black, random one-off gray scales, local trend color definitions, or page-only type scales without adding tokens.
- Conflict resolution order:
  1. Product/business meaning and data correctness.
  2. `DESIGN.md` style authority.
  3. `apps/web-vite/src/styles/design-tokens.css` runtime tokens.
  4. lobe-ui / ECharts / Tailwind implementation mappings.
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

- Runtime token sources: `apps/web-vite/src/styles/aios-theme.css` (v2 roles on lobe-ui's `--lobe-*` theme, plus the bridge) and `apps/web-vite/src/styles/design-tokens.css` (shared names with v2 values).
- lobe-ui runtime: `apps/web-vite/src/components/lobe-provider.tsx` imports the lobe stylesheets, the Geist fonts and `aios-theme.css`, sets no neutral palette (lobe's untinted gray; `theme-preference.ts` calls `setLobeTheme({ appearance })`), keeps lobe's CDN fonts off, and passes lobe's zh-CN resources. `ViteProviders` mounts it app-wide.
- Every `--aios-*` color has a light and a dark value in `aios-theme.css`; adding a v2 color without its dark value is incomplete.
- Generated/static token mirror: `DESIGN_TOKENS.json` and `apps/web-vite/src/lib/design-tokens.ts`; this full mirror is enforced by `npm run verify:design:mirror`.
- Runtime CSS token sync is executable: run `npm run verify:design:runtime-tokens`. Non-color token families in `apps/web-vite/src/styles/design-tokens.css` (typography, spacing, radius, shadow, transition, breakpoint, and component tokens) must match `DESIGN_TOKENS.json`; do not hand-tune runtime CSS without updating the token mirror.
- Transition tokens are split by CSS property semantics: `--transition-*` remains a full shorthand token for author CSS (`transition: all var(--transition-fast)`), while Tailwind `transitionDuration` must use duration-only `--transition-duration-*` tokens and Tailwind `transitionTimingFunction` must use easing-only `--transition-easing-*` tokens.
- Theme adapter value helper: `apps/web-vite/src/lib/design-token-values.ts`; React theme context and ECharts adapters should import it instead of duplicating hex values. Value-helper sync is executable: run `npm run verify:design:token-values-sync`; `DESIGN_COLOR_VALUES`, `DESIGN_FONT_FAMILY`, and `DESIGN_SHADOW_VALUES` must stay mapped to `designTokens`, `PLATFORM_LEGEND_COLORS`, and `CHART_SERIES_COLORS` rather than local literals.
- Raw color source allowlist: `scripts/config/allowlists/design-raw-color-allowlist.json`; this file is enforced by `scripts/checks/design/raw-colors-non-modules.mjs` and `scripts/checks/design/raw-color-allowlist-docs.mjs`, and must stay aligned with the Raw Color Governance table.
- Token color sync coverage config: `scripts/design-token-color-sync.config.json`; this file is enforced by `scripts/checks/frontend/design-token-color-sync.mjs` and owns the status, trend, platform, chart, and domain taxonomy keys covered by `npm run verify:design:tokens`.
- Token generator boundary enforcement is executable: run `npm run verify:design:token-generator`. `scripts/build/compile-tokens.js` is scoped to `apps/web-vite/src/lib/design-tokens.ts`; it must not generate CSS shims, Tailwind config, theme adapters, or runtime token CSS.
- Tailwind aliases live in `tailwind.config.ts` and are enforced by `npm run verify:design:tailwind` plus `npm run verify:design:tailwind-non-color-aliases`; Tailwind is a token consumption surface, so custom aliases must point back to runtime CSS variables instead of hardcoded legacy palette or sizing values. Do not reintroduce nested compatibility palettes such as `primary.500`, `success.500`, `warning.50`, `error.500`, or `info.DEFAULT`; add explicit semantic aliases instead.
- Tailwind default palette utility debt, arbitrary raw-color utility usage, and legacy compatibility color aliases are enforced by `npm run verify:design:tailwind-utilities`. `scripts/tailwind-utility-color-allowlist.json` is a temporary legacy-debt ledger for default palette utilities only, not permission for new default palette usage and not an escape hatch for arbitrary raw colors or compatibility aliases; any reduced count must shrink the allowlist in the same change.
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
- Dark mode is enabled per module only after its dark review (see Themes); until then `setLobeTheme` stays light.

## Agent Implementation Protocol

- Before editing a page, classify it into one page archetype from this document and follow that archetype's density, hierarchy, and component grammar.
- Before editing `apps/web-vite/src/app/reports/special/**`, apply the Static Special Reports contract first, then the generic Report Pages archetype. If a requested layout would make the report read like a dashboard, update the report structure or this authority document instead of adding local visual exceptions.
- Before adding a color, font size, shadow, radius, or chart palette, check whether an existing token or component contract already covers the role.
- Before extracting UI, decide whether the target is a reusable shared component or a domain module file. Shared components protect product-wide contracts; domain module files protect page maintainability.
- If adding or changing a token, update every mapped implementation surface in the same change set: CSS variables, JSON mirror, TypeScript mirror, Tailwind aliases, and ECharts defaults when relevant.
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
- [ ] v2 surfaces: ink for human actions; AI violet only for AI presence and AI selection; links and generic keyboard focus use ink; at most one violet-filled button per screen.
- [ ] v2 AI work uses the five-state grammar and the AI output marker; persistent motion runs only while AI works and none under reduced motion.
- [ ] v2 CSS consumes `--lobe-*` and `--aios-*` (no new legacy token names); lobe components are styled only through slots, `.lobe-*` classes, `data-*`, and variables.
- [ ] Every `--aios-*` color in use has a dark value, and media previews sit on `--aios-stage`.
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
