import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function assertCreatorShortVideoRenderingBehavior({ repoRoot }) {
  const detailColumnsSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-detail-columns.tsx'),
    'utf8'
  );
  const detailColumnsRenderersSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-detail-renderers.tsx'),
    'utf8'
  );
  const detailColumnsRendererStylesSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-detail-renderers.module.css'),
    'utf8'
  );
  assert.match(
    detailColumnsSource,
    /\.\.\.columns\.assetProductNames[\s\S]*\.\.\.columns\.contentAssetVideo[\s\S]*\.\.\.columns\.qianchuanMaterialIds/u,
    'detail table should lead with product, asset video, then Qianchuan material id'
  );
  assert.match(
    detailColumnsSource,
    /renderShortVideoQianchuanMaterialIdsCell/u,
    'Qianchuan material id column should use the conflict-aware renderer'
  );
  assert.match(
    detailColumnsRenderersSource,
    /aria-label="多个千川素材ID需人工核对"/u,
    'multiple material id warning should expose an accessible label'
  );
  assert.match(
    detailColumnsRenderersSource,
    /系统不会自动预填，请业务核对后手动填写/u,
    'multiple material id warning should explain manual review behavior'
  );
  assert.match(
    detailColumnsRendererStylesSource,
    /--status-danger/u,
    'multiple material id warning should use AIOS danger tokens instead of raw red colors'
  );
  assert.doesNotMatch(
    detailColumnsSource,
    /withoutFixedColumn\(columns\.statDate\)/u,
    'detail table should not render transaction date as a visible period-summary column'
  );
  assert.match(
    detailColumnsSource,
    /withoutFixedColumn\(columns\.influencerName\)/u,
    'detail table should not keep influencer as a left-fixed column after product/material columns'
  );
  assert.doesNotMatch(
    detailColumnsSource,
    /\.\.\.columns\.assetProductNames[\s\S]{0,500}buildQianchuanGmvColumn\(\)/u,
    'detail table should not place Qianchuan GMV inside the identity columns before product/material context'
  );
  assert.match(
    detailColumnsSource,
    /function buildPerformanceColumns\(\)[\s\S]*return \[\s*buildQianchuanGmvColumn\(\),[\s\S]*title:\s*'千川GSV'/u,
    'detail table should keep Qianchuan GMV in the efficiency metrics group before Qianchuan GSV'
  );
  assert.match(
    detailColumnsSource,
    /title:\s*'千川GMV'/u,
    'detail table should expose Qianchuan GMV before Qianchuan cost'
  );
  assert.match(
    detailColumnsSource,
    /title:\s*'千川GMV'[\s\S]*title:\s*'千川GSV'[\s\S]*title:\s*'千川消耗'[\s\S]*title:\s*'千川ROI'[\s\S]*title:\s*'挂车GMV'/u,
    'detail table should place Qianchuan GMV/GSV/cost/ROI before cart GMV'
  );
  assert.match(
    detailColumnsSource,
    /title:\s*'千川GSV'/u,
    'detail table should expose Qianchuan GSV from qianchuan_net_gmv'
  );
  assert.match(
    detailColumnsSource,
    /title:\s*'千川ROI'/u,
    'detail table should rename traffic ROI to Qianchuan ROI'
  );
  assert.doesNotMatch(
    detailColumnsSource,
    /title:\s*'挂车ROI'/u,
    'detail table should no longer expose cart ROI'
  );
  assert.doesNotMatch(
    detailColumnsSource,
    /title:\s*'投流ROI'/u,
    'detail table should no longer use traffic ROI wording'
  );
  assert.match(
    detailColumnsSource,
    /title:\s*'挂车GSV'/u,
    'detail table should keep the visible performance column named as cart GSV'
  );
  assert.doesNotMatch(
    detailColumnsSource,
    /title:\s*'GSV \/ 退款金额'/u,
    'detail table should not name the cart GSV column as a dual-purpose metric'
  );
  assert.doesNotMatch(
    detailColumnsSource,
    /title:\s*'退款金额（退款时间）'/u,
    'detail table should not keep a standalone visible refund column'
  );
  assert.doesNotMatch(
    detailColumnsSource,
    /title:\s*'挂车GSV（退款时间）'/u,
    'detail table should use the concise visible cart GSV header'
  );
  assert.doesNotMatch(
    detailColumnsSource,
    /title:\s*'挂车GSV（退款时间）'[\s\S]{0,160}dataIndex:\s*'refund_amount'/u,
    'derived GSV column must not expose refund_amount as its dataIndex'
  );
  assert.match(
    detailColumnsSource,
    /key:\s*'shortvideo_gsv'[\s\S]*sorter:\s*\(left,\s*right\)\s*=>\s*resolveShortVideoGsv\(left\)\s*-\s*resolveShortVideoGsv\(right\)/u,
    'cart GSV column should sort by actual GSV contribution'
  );
  assert.match(
    detailColumnsSource,
    /renderShortVideoGsvCell/u,
    'cart GSV column should render only the GSV amount'
  );
  assert.doesNotMatch(
    detailColumnsSource,
    /renderShortVideoGsvOrRefundAmountCell/u,
    'detail table should not keep the old dual-purpose GSV/refund renderer'
  );

  const manualAttrColumnsSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-manual-attrs-columns.tsx'),
    'utf8'
  );
  assert.match(
    manualAttrColumnsSource,
    /nativeEvent\.isComposing/u,
    'manual tag Select Enter handling should guard Chinese IME composition'
  );
  assert.match(
    manualAttrColumnsSource,
    /nativeEvent\.keyCode\s*===\s*229/u,
    'manual tag Select Enter handling should keep keyCode 229 IME fallback'
  );
  assert.match(
    manualAttrColumnsSource,
    /placeholder="选已有标签，或直接输入新标签"/u,
    'creator type editor should tell users they can select an existing tag or type a new one'
  );
  assert.match(
    manualAttrColumnsSource,
    /placeholder="选已有 MCN，或直接输入新机构"/u,
    'MCN editor should tell users they can select an existing MCN or type a new one'
  );
  assert.match(
    manualAttrColumnsSource,
    /没有匹配项，输入后按 Enter 作为新标签/u,
    'creator type empty-search copy should explain Enter creates a new tag'
  );
  assert.match(
    manualAttrColumnsSource,
    /没有匹配项，输入后按 Enter 作为新 MCN/u,
    'MCN empty-search copy should explain Enter creates a new MCN'
  );

  const manualAttrsSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-manual-attrs.tsx'),
    'utf8'
  );
  assert.match(
    manualAttrsSource,
    /isCreatorTypeInputRejected\(creatorTypeSearchValue\)/u,
    'manual creator type save should reject legacy level input instead of silently falling back to the previous draft value'
  );
  assert.match(
    manualAttrsSource,
    /CREATOR_TYPE_INPUT_REJECTED_MESSAGE/u,
    'manual creator type rejection should surface user-visible feedback'
  );

  const manualAttrStylesSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-manual-attrs.module.css'),
    'utf8'
  );
  assert.match(
    manualAttrStylesSource,
    /\.manualAttrColumnCell\s*\{[\s\S]*background:/u,
    'manual maintenance columns should keep a distinct body background'
  );
  assert.match(
    manualAttrStylesSource,
    /\.manualAttrColumnCell\s*\{[\s\S]*vertical-align:\s*middle/u,
    'manual maintenance edit controls should stay vertically centered in their table cells'
  );
  assert.match(
    manualAttrStylesSource,
    /\.manualAttrNumberInput:global\(\.ant-input-number-focused\)/u,
    'manual number inputs should own a single visible focus treatment instead of nested small boxes'
  );
  assert.match(
    manualAttrStylesSource,
    /\.manualAttrNumberInput\s+:global\(\.ant-input-number-input\)\s*\{[\s\S]*text-align:\s*right/u,
    'manual number input values should remain right-aligned while only placeholders center'
  );
  assert.match(
    manualAttrStylesSource,
    /\.manualAttrNumberInput\s+:global\(\.ant-input-number-input:placeholder-shown\)[\s\S]*text-align:\s*center/u,
    'manual number input placeholders should align with the other manual-field placeholders'
  );
  assert.match(
    manualAttrStylesSource,
    /\.manualAttrNoteInput:placeholder-shown[\s\S]*text-align:\s*center/u,
    'manual note input placeholders should align with number and select placeholders'
  );
  assert.match(
    manualAttrStylesSource,
    /\.manualAttrTagSelect\s+:global\(\.ant-select-selection-placeholder\)\s*\{[\s\S]*text-align:\s*center/u,
    'manual Select placeholders should align with number and note placeholders'
  );
  assert.match(
    manualAttrStylesSource,
    /\.manualAttrTag\s*\{[\s\S]*text-overflow:\s*ellipsis/u,
    'manual creator type and MCN chips should ellipsize long maintained values inside fixed table columns'
  );

  const dashboardStylesSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-dashboard.module.css'),
    'utf8'
  );
  assert.doesNotMatch(
    dashboardStylesSource,
    /\.chartPanel\s*\{[^}]*overflow-x:\s*clip/u,
    'shared chart panel must not clip detail table horizontal scrolling'
  );

  const liveDashboardStylesSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard.module.css'),
    'utf8'
  );
  assert.doesNotMatch(
    liveDashboardStylesSource,
    /\.detailTable\s*\{[^}]*overflow:\s*hidden/u,
    'detail table wrapper must not hide Ant Table horizontal scrolling'
  );
  assert.doesNotMatch(
    liveDashboardStylesSource,
    /\.detailTable\s*:global\(\.ant-table-container\)[^{]*\{[^}]*overflow:\s*hidden/u,
    'Ant Table container must not be forced to overflow hidden'
  );

  const liveDashboardMetricStylesSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard-metrics.module.css'),
    'utf8'
  );
  assert.match(
    liveDashboardMetricStylesSource,
    /\.liveMetricGridShortVideoBusinessGroups\s*\{[\s\S]*grid-template-columns:\s*repeat\(35,\s*minmax\(0,\s*1fr\)\)/u,
    'short-video metric groups should use a 35-column desktop grid so 5-card and 7-card rows both fill the container'
  );
  assert.match(
    liveDashboardMetricStylesSource,
    /\.liveMetricGridShortVideoBusinessGroups \.liveMetricCard(?:,[\s\S]*?\.liveMetricGridShortVideoBusinessGroups \.liveMetricCardFeatured)?\s*\{[\s\S]*grid-column:\s*span 5/u,
    'short-video secondary metric row should span seven equal cards across the full row'
  );
  assert.match(
    liveDashboardMetricStylesSource,
    /\.liveMetricGridShortVideoBusinessGroups \.liveMetricCard:nth-child\(-n \+ 5\)(?:,[\s\S]*?\.liveMetricGridShortVideoBusinessGroups \.liveMetricCardFeatured:nth-child\(-n \+ 5\))?\s*\{[\s\S]*grid-column:\s*span 7/u,
    'short-video first metric row should span five equal cards across the full row'
  );
  assert.match(
    liveDashboardMetricStylesSource,
    /\.liveMetricGrid:not\(\.liveMetricGridFeaturedPlusFourColumn\):not\(\.liveMetricGridShortVideoBusinessGroups\)\s*[\r\n ]+\.liveMetricCardFeatured\s*\{[\s\S]*grid-column:\s*span 1/u,
    'responsive featured-card fallback must explicitly exclude short-video 5+7 metric groups'
  );
  assert.match(
    liveDashboardMetricStylesSource,
    /@media \(max-width:\s*900px\)[\s\S]*\.liveMetricGridShortVideoBusinessGroups \.liveMetricCard:nth-child\(-n \+ 5\)[\s\S]*grid-column:\s*span 1/u,
    'responsive short-video metric groups should override the higher-specificity first-row desktop spans'
  );
  assert.match(
    liveDashboardMetricStylesSource,
    /@media \(max-width:\s*768px\)[\s\S]*\.liveMetricGridShortVideoBusinessGroups\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
    'mobile short-video metric groups should use a shrinkable single-column track'
  );
  assert.match(
    liveDashboardMetricStylesSource,
    /\.liveMetricCard\s*\{[\s\S]*min-width:\s*0/u,
    'metric cards should be allowed to shrink inside responsive grid tracks'
  );

  const sceneStrategyStylesSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-scene-strategy-tree.module.css'),
    'utf8'
  );
  assert.doesNotMatch(
    sceneStrategyStylesSource,
    /\.sceneStrategyPanel\s*\{[^}]*overflow-x:\s*clip/u,
    'scene strategy panel must not clip its scrollable wide table'
  );

  const detailRenderersSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-detail-renderers.tsx'),
    'utf8'
  );
  const detailRendererStylesSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-detail-renderers.module.css'),
    'utf8'
  );
  assert.doesNotMatch(
    detailRenderersSource,
    /Math\.random/u,
    'asset chip tones must not use Math.random'
  );
  assert.match(
    detailRenderersSource,
    /hashStringToToneIndex/u,
    'asset chip tones should expose a deterministic text hash resolver'
  );
  assert.match(
    detailRenderersSource,
    /resolveAssetChipToneClassName/u,
    'asset chip tones should resolve text values into stable tone classes'
  );
  assert.match(
    detailRenderersSource,
    /resolveAssetChipClassName/u,
    'asset chip renderers should use a single class-name resolver'
  );
  assert.match(
    detailRenderersSource,
    /className=\{resolveAssetChipClassName\(item\)\}/u,
    'ordinary short-video chip values should use the stable tone resolver'
  );
  assert.match(
    detailRenderersSource,
    /className=\{resolveAssetChipClassName\(assetId\)\}/u,
    'content asset link chips should use the stable tone resolver by asset id'
  );
  assert.match(
    detailRenderersSource,
    /\[styles\.assetChip,\s*styles\.assetChipMore\]\.join\(' '\)/u,
    'overflow +N chips should stay neutral instead of using the hashed tone resolver'
  );
  assert.match(
    detailRenderersSource,
    /\[styles\.assetChip,\s*styles\.assetChipMuted\]\.join\(' '\)[\s\S]*未绑定，点击上传素材/u,
    'unbound content asset chips should stay muted and expose the upload action copy'
  );
  assert.match(
    detailRenderersSource,
    /to=\{buildShortVideoContentAssetUploadPath\(row\)\}/u,
    'unbound content asset chips should open content-assets upload with current row prefill'
  );
  assert.ok(
    new Set([...detailRendererStylesSource.matchAll(/\.assetChipTone[A-Za-z0-9_-]+\s*\{/gu)].map((match) => match[0])).size >= 5,
    'asset chip renderer CSS should provide at least five deterministic tone classes'
  );
  assert.match(
    detailRenderersSource,
    /key=\{`\$\{assetId\}:\$\{index\}`\}/u,
    'content asset links should use asset id plus index as React key'
  );
  assert.match(
    detailRenderersSource,
    /target="_blank"/u,
    'content asset video links should open in a new tab so the short-video table state stays in place'
  );
  assert.match(
    detailRenderersSource,
    /rel="noopener noreferrer"/u,
    'new-tab content asset video links should use noopener noreferrer'
  );
  assert.doesNotMatch(
    detailRenderersSource,
    /creator-short-video-manual-attrs\.module\.css/u,
    'detail renderers should not depend on manual-maintenance CSS semantics'
  );
  assert.match(
    detailRenderersSource,
    /renderShortVideoGsvCell/u,
    'detail renderers should expose a single-purpose cart GSV renderer'
  );
  assert.doesNotMatch(
    detailRenderersSource,
    /conditionalMetricLabel(?:Refund|Gsv)?/u,
    'cart GSV renderer should not render GSV/refund capsule labels'
  );

  const sceneStrategySource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-scene-strategy-tree.tsx'),
    'utf8'
  );
  assert.match(
    sceneStrategySource,
    /title:\s*'场景'/u,
    'scene strategy table first column should use the concise scene header'
  );
  assert.doesNotMatch(
    sceneStrategySource,
    /title:\s*'场景路径'/u,
    'scene strategy table should not keep the old scene path header'
  );
  assert.doesNotMatch(
    sceneStrategySource,
    /title:\s*'场景策略层级'/u,
    'scene strategy table should not keep the old generic hierarchy column title'
  );
  assert.match(
    sceneStrategySource,
    /备注：按场景类型、大场景、细分场景逐级聚合；标签里的“\/”仅作为业务词组保留。千川指标为素材广告归因，挂车指标为罗盘末次成交归因；视频数、新视频数、出单视频数均只按视频ID去重，未匹配到视频ID的千川素材仅贡献千川GMV\/GSV\/消耗\/订单数\/ROI，不增加视频类数量。/u,
    'scene strategy note should explain aggregation, slash semantics, attribution, and video-id-only ordered count'
  );
  assert.match(
    sceneStrategySource,
    /title=\{row\.displayPath\}/u,
    'scene strategy rows should keep the full structured path in title text'
  );
  assert.match(
    sceneStrategySource,
    /aria-label=\{`\$\{row\.levelLabel\}：\$\{row\.displayPath\}`\}/u,
    'scene strategy rows should keep the full structured path in accessible labels'
  );
  assert.doesNotMatch(
    sceneStrategySource,
    /sceneStrategyPathText/u,
    'scene strategy rows should not render the full path as secondary inline text'
  );
  assert.match(
    sceneStrategySource,
    /title:\s*'千川GMV'[\s\S]*title:\s*'千川GSV'[\s\S]*title:\s*'千川消耗'[\s\S]*title:\s*'千川订单'[\s\S]*title:\s*'千川ROI'[\s\S]*title:\s*'挂车GMV'/u,
    'scene strategy table should place the Qianchuan metrics before cart GMV'
  );
  assert.match(
    sceneStrategySource,
    /title:\s*'千川GSV占比'/u,
    'scene strategy table should use Qianchuan GSV share'
  );
  assert.doesNotMatch(
    sceneStrategySource,
    /挂车ROI|投流ROI|投流消耗|挂车GMV占比/u,
    'scene strategy table should not keep retired traffic/cart ROI labels'
  );

  const shortVideoClientSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-dashboard-client.tsx'),
    'utf8'
  );
  const liveClientSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard-client.tsx'),
    'utf8'
  );
  const detailTableSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-detail-table.tsx'),
    'utf8'
  );
  const detailSectionSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-detail-section.tsx'),
    'utf8'
  );
  const detailHeaderSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-detail-header.tsx'),
    'utf8'
  );
  const detailExportActionsSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-detail-export-actions.tsx'),
    'utf8'
  );
  const shortVideoCsvExportSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-csv-export.ts'),
    'utf8'
  );
  assert.match(
    detailTableSource,
    /scrollY\?:\s*number/u,
    'shared creator detail table should accept an optional vertical body scroll height'
  );
  assert.match(
    detailTableSource,
    /scroll=\{typeof scrollY === 'number' \? \{ x: scrollX, y: scrollY \} : \{ x: scrollX \}\}/u,
    'shared creator detail table should only enable vertical body scroll when requested'
  );
  assert.match(
    detailSectionSource,
    /scrollY\?:\s*CreatorDetailTableProps<TRecord>\['scrollY'\]/u,
    'creator detail section should forward the optional vertical body scroll height'
  );
  assert.match(
    shortVideoClientSource,
    /const SHORT_VIDEO_DETAIL_TABLE_SCROLL_Y\s*=\s*\d+/u,
    'short-video detail table should define a dedicated vertical body scroll height'
  );
  assert.match(
    shortVideoClientSource,
    /scrollY=\{SHORT_VIDEO_DETAIL_TABLE_SCROLL_Y\}/u,
    'short-video detail table should scroll rows inside the table body so the header remains visible'
  );
  assert.match(
    shortVideoClientSource,
    /sortCreatorShortVideoDetailRows\(filteredDetailRows\)/u,
    'short-video transaction detail export should keep a default sorted row order'
  );
  assert.match(
    shortVideoClientSource,
    /buildCreatorShortVideoSummaryRows\(filteredDetailRows,\s*currentRange\)/u,
    'short-video detail table should aggregate filtered rows by selected range before rendering'
  );
  assert.match(
    shortVideoClientSource,
    /sortCreatorShortVideoDetailRows\(summaryDetailRows\)/u,
    'short-video detail table should default-sort summary rows before rendering'
  );
  assert.match(
    shortVideoClientSource,
    /dataSource=\{sortedSummaryDetailRows\}/u,
    'short-video detail table should render the sorted current summary rows'
  );
  assert.match(
    shortVideoClientSource,
    /rows:\s*sortedFilteredDetailRows/u,
    'short-video transaction-detail CSV export should keep sorted source rows'
  );
  assert.match(
    shortVideoClientSource,
    /summaryRows:\s*sortedSummaryDetailRows/u,
    'short-video current-summary CSV export should use the same sorted summary rows as the table'
  );
  assert.match(
    shortVideoClientSource,
    /exportButtonLabel="导出明细"[\s\S]*label:\s*'导出当前汇总'[\s\S]*label:\s*'导出成交明细'/u,
    'short-video export button should open a two-item export menu before exporting'
  );
  assert.match(
    detailExportActionsSource,
    /trigger=\{\['hover',\s*'click'\]\}/u,
    'creator detail export menu should open on hover and click'
  );
  assert.match(
    detailHeaderSource,
    /<CreatorDetailExportActions/u,
    'creator detail header should delegate export and login actions to the focused action component'
  );
  assert.match(
    shortVideoCsvExportSource,
    /SHORT_VIDEO_CURRENT_SUMMARY_CSV_HEADERS[\s\S]*'统计开始日期'[\s\S]*'统计结束日期'/u,
    'current-summary CSV should include selected range start/end columns'
  );
  assert.match(
    shortVideoCsvExportSource,
    /filter\(\(_, index\) => index !== TRANSACTION_DATE_HEADER_INDEX\)/u,
    'current-summary CSV should remove transaction date from the period summary export'
  );
  assert.match(
    shortVideoCsvExportSource,
    /SHORT_VIDEO_TRANSACTION_DETAIL_CSV_HEADERS[\s\S]*'成交日期'/u,
    'transaction-detail CSV should keep transaction date'
  );
  assert.doesNotMatch(
    liveClientSource,
    /scrollY=/u,
    'live creator detail table should not be forced into the short-video body-scroll interaction'
  );
  assert.match(
    detailHeaderSource,
    /optionFilterProp(?:=|:\s*)['"]label['"]/u,
    'detail filter select should search labels instead of internal values such as Douyin ids'
  );
  assert.match(
    shortVideoClientSource,
    /creatorValue=\{filterCreator\}[\s\S]*cooperationStatusValue=\{filterCooperationStatus\}/u,
    'short-video detail filters should place creator before product/status filters'
  );
  assert.match(
    shortVideoClientSource,
    /skeletonCount=\{12\}[\s\S]*featuredSkeletonCount=\{5\}[\s\S]*layout="shortVideoBusinessGroups"/u,
    'short-video metric cards should render five core KPIs above seven transaction/traffic KPIs'
  );
  assert.match(
    shortVideoClientSource,
    /subtitle="人工维护字段按达人\+视频维度保存。"/u,
    'short-video detail header should not carry the long date and attribution explanation'
  );
  assert.match(
    shortVideoClientSource,
    /备注：总视频数、新视频数、出单数按视频ID去重，其中出单数表示出单视频数，不是订单数量；未匹配到视频ID的千川素材只计入千川GMV\/GSV\/消耗\/订单数\/ROI，不增加视频类数量。千川为素材广告归因，未维护视频\/场景映射仍保留指标并进入未维护分组；挂车为罗盘末次成交归因/u,
    'short-video attribution and video-id-only count explanation should live in the detail note'
  );

  assert.match(
    liveDashboardStylesSource,
    /\.detailFilterControlsFour[\s\S]*repeat\(4,\s*minmax\(132px,\s*156px\)\)/u,
    'four short-video filters should stay horizontal on desktop'
  );

  const shortVideoTrendChartSource = await readFile(
    path.join(repoRoot, 'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-trend-chart.ts'),
    'utf8'
  );
  assert.match(
    shortVideoTrendChartSource,
    /name:\s*'千川GMV'[\s\S]*type:\s*'bar'[\s\S]*name:\s*'千川GSV'[\s\S]*type:\s*'bar'/u,
    'short-video trend chart should render Qianchuan GMV/GSV as bars'
  );
  assert.match(
    shortVideoTrendChartSource,
    /name:\s*'挂车GMV'[\s\S]*type:\s*'line'[\s\S]*name:\s*'挂车GSV'[\s\S]*type:\s*'line'/u,
    'short-video trend chart should render cart GMV/GSV as lines'
  );
  assert.match(
    shortVideoTrendChartSource,
    /'千川GMV'[\s\S]*'千川GSV'[\s\S]*'千川订单'[\s\S]*'千川ROI'[\s\S]*'挂车GMV'[\s\S]*'挂车GSV'/u,
    'short-video trend tooltip should expose the six requested metrics'
  );
}
