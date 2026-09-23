/* global document, window */

export function captureSpecialReportVisualSnapshot() {
  const documentElement = document.documentElement;
  const bodyText = document.body?.innerText?.trim() ?? '';
  const chartNodes = [...document.querySelectorAll('[data-chart-mounted]')];
  const evidenceDetails = [...document.querySelectorAll('details[data-evidence-shown-count]')];
  const mobileTocDetails = [...document.querySelectorAll('nav[aria-label="专题报告目录"] details')];
  const tocNavNodes = [...document.querySelectorAll('nav[aria-label="专题报告目录"][data-toc-mode]')];
  const staticVisualNodes = [...document.querySelectorAll('[data-static-report-visual]')];
  const tmallProductsSection = document.getElementById('tmall-products');
  const tmallProductTrendSection = document.getElementById('tmall-product-trend');
  const tmallProductDeltaSection = document.getElementById('tmall-product-delta');
  const tmallProductAttributionSection = document.getElementById('tmall-product-attribution');
  const tmallProductSections = [
    tmallProductsSection,
    tmallProductTrendSection,
    tmallProductDeltaSection,
    tmallProductAttributionSection,
  ].filter(Boolean);
  const tmallProductTrendVisual = tmallProductTrendSection?.querySelector('[data-static-report-visual="TmallProductTrendVisualTable"]');
  const tmallProductTrendTable = tmallProductTrendVisual?.querySelector('table');
  const tmallProductTrendHeaders = tmallProductTrendTable
    ? [...tmallProductTrendTable.querySelectorAll('thead th')].map((node) => node.getAttribute('data-product-trend-header') || node.textContent?.replace(/\s+/g, ' ').trim() || '')
    : [];
  const tmallProductTrendRowCount = tmallProductTrendTable?.querySelectorAll('tbody tr').length ?? 0;
  const tmallProductScaleCells = tmallProductTrendTable
    ? [...tmallProductTrendTable.querySelectorAll('td[data-product-visual-variant="bar-mom"]')]
    : [];
  const tmallProductRateCells = tmallProductTrendTable
    ? [...tmallProductTrendTable.querySelectorAll('td[data-product-visual-variant="line"]')]
    : [];
  const tmallProductMissingNodes = tmallProductTrendVisual
    ? [...tmallProductTrendVisual.querySelectorAll('[data-missing-top-product-cell="true"]')]
    : [];
  const tmallProductTrendVisibleMonthLabels = tmallProductTrendTable
    ? [...tmallProductTrendTable.querySelectorAll('tbody td')]
      .map((node) => node.innerText?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((text) => /^(1|2|3|4|5|6|1月|2月|3月|4月|5月|6月|6月预估)$/.test(text))
    : [];
  const tmallProductFirstTrendRow = tmallProductTrendTable?.querySelector('tbody tr');
  const tmallProductTrendColumnWidths = tmallProductFirstTrendRow
    ? {
      product: Math.round(tmallProductFirstTrendRow.querySelector('th')?.getBoundingClientRect().width ?? 0),
      metrics: [...tmallProductFirstTrendRow.querySelectorAll('td')].map((node) => Math.round(node.getBoundingClientRect().width)),
    }
    : { product: 0, metrics: [] };
  const viewportWidth = documentElement.clientWidth;
  const numberFromAttribute = (node, attributeName) => {
    const value = Number(node.getAttribute(attributeName));
    return Number.isFinite(value) ? value : null;
  };
  const countRenderedRows = (node) => (
    [...node.querySelectorAll('tbody tr')]
      .filter((row) => row.getClientRects().length > 0 || row.closest('details'))
      .length
  );
  const measureHiddenEvidenceVisual = (node) => {
    const closedAncestors = [];
    let current = node.parentElement;
    while (current) {
      if (current.tagName === 'DETAILS' && !current.open) {
        closedAncestors.push(current);
        current.open = true;
      }
      current = current.parentElement;
    }
    try {
      return node.getBoundingClientRect();
    } finally {
      closedAncestors.forEach((details) => {
        details.open = false;
      });
    }
  };
  const evidenceSummaries = evidenceDetails.map((details) => {
    const shownCount = numberFromAttribute(details, 'data-evidence-shown-count');
    const totalCount = numberFromAttribute(details, 'data-evidence-total-count');
    return {
      open: details.open,
      renderedRowCount: countRenderedRows(details),
      sectionId: details.closest('section[id]')?.id ?? '',
      shownCount,
      totalCount,
      sourcePeriod: details.getAttribute('data-evidence-source-period') ?? '',
    };
  });
  const tocNavSummaries = tocNavNodes.map((nav) => {
    const entryNodes = [...nav.querySelectorAll('[data-toc-entry-id]')];
    const currentNode = nav.querySelector('[data-toc-current-entry-id]');
    return {
      activeTargetId: currentNode?.getAttribute('data-toc-active-target-id') ?? '',
      currentText: currentNode?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      currentEntryId: currentNode?.getAttribute('data-toc-current-entry-id') ?? '',
      entryCount: numberFromAttribute(nav, 'data-toc-entry-count'),
      entryIds: entryNodes.map((node) => node.getAttribute('data-toc-entry-id') ?? ''),
      hiddenAnchorEntryIds: entryNodes
        .filter((node) => node.getAttribute('data-toc-hidden-anchor') === 'true')
        .map((node) => node.getAttribute('data-toc-entry-id') ?? ''),
      levelByEntryId: Object.fromEntries(
        entryNodes.map((node) => [
          node.getAttribute('data-toc-entry-id') ?? '',
          node.getAttribute('data-toc-level') ?? '',
        ]),
      ),
      markerByEntryId: Object.fromEntries(
        entryNodes.map((node) => [
          node.getAttribute('data-toc-entry-id') ?? '',
          node.getAttribute('data-toc-marker') ?? '',
        ]),
      ),
      mode: nav.getAttribute('data-toc-mode') ?? '',
      statusByEntryId: Object.fromEntries(
        entryNodes.map((node) => [
          node.getAttribute('data-toc-entry-id') ?? '',
          node.getAttribute('data-toc-status') ?? '',
        ]),
      ),
      textByEntryId: Object.fromEntries(
        entryNodes.map((node) => [
          node.getAttribute('data-toc-entry-id') ?? '',
          node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        ]),
      ),
      visibleEntryCount: numberFromAttribute(nav, 'data-toc-visible-entry-count'),
    };
  });
  const chartSummaries = chartNodes.map((node) => {
    const rect = node.getBoundingClientRect();
    const graphicNodes = [...node.querySelectorAll('canvas, svg')];
    const directChildRects = [...node.children].map((child) => child.getBoundingClientRect());
    const figureNode = node.closest('figure');
    const figureRect = figureNode?.getBoundingClientRect();
    const frameOverflow = figureRect
      ? rect.left < figureRect.left - 2
        || rect.right > figureRect.right + 2
        || rect.top < figureRect.top - 2
        || rect.bottom > figureRect.bottom + 2
      : false;
    const graphicViewportOverflow = graphicNodes.some((graphic) => {
      const graphicRect = graphic.getBoundingClientRect();
      return graphicRect.left < -2 || graphicRect.right > viewportWidth + 2;
    });
    const directChildFrameOverflow = graphicNodes.length > 0 && directChildRects.some((childRect) => (
      childRect.width > rect.width + 2 || childRect.height > rect.height + 2
    ));
    const graphicFrameOverflow = graphicNodes.some((graphic) => {
      const graphicRect = graphic.getBoundingClientRect();
      return graphicRect.width > rect.width + 2 || graphicRect.height > rect.height + 2;
    });
    return {
      directChildFrameOverflow,
      frameOverflow,
      graphicFrameOverflow,
      graphicViewportOverflow,
      builder: figureNode?.getAttribute('data-chart-builder') ?? '',
      hasAccessibleName: Boolean(node.getAttribute('aria-label')?.trim()),
      hasSemanticMetadata: [
        'data-chart-builder',
        'data-chart-claim',
        'data-chart-evidence-destination',
        'data-chart-primary-value-label',
        'data-chart-question',
        'data-chart-sort-rule',
        'data-chart-template',
        'data-gallery-fixture-id',
      ].every((attributeName) => Boolean(figureNode?.getAttribute(attributeName)?.trim())),
      innerScrollOverflow: node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2,
      maxDirectChildWidth: Math.round(Math.max(0, ...directChildRects.map((childRect) => childRect.width))),
      maxGraphicWidth: Math.round(Math.max(
        0,
        ...graphicNodes.map((graphic) => graphic.getBoundingClientRect().width),
      )),
      mounted: node.getAttribute('data-chart-mounted') === 'true',
      rendered: node.getAttribute('data-chart-rendered') === 'true',
      nonZeroBox: rect.width > 10 && rect.height > 10,
      nonZeroGraphic: graphicNodes.some((graphic) => {
        const graphicRect = graphic.getBoundingClientRect();
        return graphicRect.width > 10 && graphicRect.height > 10;
      }),
      sectionId: node.closest('section[id]')?.id ?? '',
      viewportOverflow: rect.left < -2 || rect.right > viewportWidth + 2,
    };
  });
  const staticVisualSummaries = staticVisualNodes.map((node) => {
    const rect = measureHiddenEvidenceVisual(node);
    return {
      name: node.getAttribute('data-static-report-visual') ?? '',
      height: Math.round(rect.height),
      hasSemanticMetadata: [
        'data-chart-claim',
        'data-chart-evidence-destination',
        'data-chart-primary-value-label',
        'data-chart-question',
        'data-chart-renderer',
        'data-chart-sort-rule',
        'data-chart-template',
        'data-gallery-fixture-id',
      ].every((attributeName) => Boolean(node.getAttribute(attributeName)?.trim())),
      nonZeroBox: rect.width > 10 && rect.height > 10,
      viewportOverflow: rect.left < -2 || rect.right > viewportWidth + 2,
      width: Math.round(rect.width),
    };
  });
  const sectionSummaries = [...document.querySelectorAll('main section[id]')]
    .filter((section) => !section.closest('details'))
    .map((section) => {
      const sectionEvidence = [...section.querySelectorAll('details[data-evidence-shown-count]')]
        .filter((details) => !details.parentElement?.closest('details[data-evidence-shown-count]'));
      const evidenceShownCount = sectionEvidence.reduce((sum, details) => (
        sum + (numberFromAttribute(details, 'data-evidence-shown-count') ?? 0)
      ), 0);
      const renderedRowCount = sectionEvidence.reduce((sum, details) => sum + countRenderedRows(details), 0);

      return {
        chartCount: section.querySelectorAll('[data-chart-mounted]').length,
        evidenceDrawerCount: sectionEvidence.length,
        evidenceShownCount,
        figureCount: section.querySelectorAll('figure').length,
        id: section.id,
        renderedRowCount,
        tableCount: section.querySelectorAll('table').length,
      };
    });

  return {
    bodyText,
    bodyTextLength: bodyText.length,
    bodyTextSample: bodyText.slice(0, 500),
    chartFrameOverflowCount: chartSummaries.filter((chart) => chart.frameOverflow).length,
    chartGraphicFrameOverflowCount: chartSummaries.filter((chart) => chart.directChildFrameOverflow || chart.graphicFrameOverflow).length,
    chartInnerScrollOverflowCount: chartSummaries.filter((chart) => chart.innerScrollOverflow).length,
    chartMaxDirectChildWidth: Math.max(0, ...chartSummaries.map((chart) => chart.maxDirectChildWidth)),
    chartMaxGraphicWidth: Math.max(0, ...chartSummaries.map((chart) => chart.maxGraphicWidth)),
    chartMissingAccessibleNameCount: chartSummaries.filter((chart) => !chart.hasAccessibleName).length,
    chartMissingSemanticMetadataCount: chartSummaries.filter((chart) => !chart.hasSemanticMetadata).length,
    chartMountedCount: chartSummaries.filter((chart) => chart.mounted).length,
    chartBuilders: chartSummaries.map((chart) => chart.builder),
    chartNodeCount: chartSummaries.length,
    chartNonZeroBoxCount: chartSummaries.filter((chart) => chart.nonZeroBox).length,
    chartNonZeroGraphicCount: chartSummaries.filter((chart) => chart.nonZeroGraphic).length,
    chartRenderedCount: chartSummaries.filter((chart) => chart.rendered).length,
    chartSectionIds: chartSummaries.map((chart) => chart.sectionId),
    chartViewportOverflowCount: chartSummaries.filter((chart) => chart.viewportOverflow || chart.graphicViewportOverflow).length,
    evidenceDetailCount: evidenceDetails.length,
    evidenceOpenCount: evidenceDetails.filter((details) => details.open).length,
    evidenceSummaries,
    finalPath: window.location.pathname,
    finalSearch: window.location.search,
    hasRoot: Boolean(document.getElementById('root')),
    horizontalOverflow: documentElement.scrollWidth > documentElement.clientWidth + 2,
    mobileEvidenceCellLabelCount: document.querySelectorAll(
      'td[data-cell-label], td[data-label], th[data-label]'
    ).length,
    mobileTocDetailsCount: mobileTocDetails.length,
    mobileTocOpenCount: mobileTocDetails.filter((details) => details.open).length,
    pageErrors: window.__specialReportSmokeErrors || [],
    consoleErrors: window.__specialReportSmokeConsoleErrors || [],
    reportModeDataset: documentElement.dataset.reportMode ?? '',
    publishedPlaceholderCount: document.querySelectorAll('[aria-label="章节内容待补充"]').length,
    sectionSummaries,
    staticVisualCount: staticVisualSummaries.length,
    staticVisualMaxHeight: Math.max(0, ...staticVisualSummaries.map((visual) => visual.height)),
    staticVisualMissingSemanticMetadataCount: staticVisualSummaries.filter((visual) => !visual.hasSemanticMetadata).length,
    staticVisualNames: staticVisualSummaries.map((visual) => visual.name),
    staticVisualNonZeroBoxCount: staticVisualSummaries.filter((visual) => visual.nonZeroBox).length,
    staticVisualSummaries,
    staticVisualViewportOverflowCount: staticVisualSummaries.filter((visual) => visual.viewportOverflow).length,
    tmallProductAppendixDrawerCount: tmallProductSections.reduce((count, section) => count + section.querySelectorAll('details[data-evidence-shown-count]').length, 0),
    tmallProductMissingCellCount: tmallProductMissingNodes.length,
    tmallProductMissingFillCount: tmallProductMissingNodes.filter((node) => Boolean(node.querySelector('b'))).length,
    tmallProductBodyText: tmallProductSections
      .map((section) => section.innerText?.replace(/\s+/g, ' ').trim() ?? '')
      .join(' | '),
    tmallProductPageHeaderText: tmallProductSections.map((section) => section.querySelector('header')?.innerText?.replace(/\s+/g, ' ').trim() ?? '').join(' | '),
    tmallProductRateCellCount: tmallProductRateCells.length,
    tmallProductRateLineVisualCount: tmallProductRateCells.filter((node) => Boolean(node.querySelector('[data-product-rate-line="true"]'))).length,
    tmallProductScaleBarMomCellCount: tmallProductScaleCells.length,
    tmallProductScaleBarVisualCount: tmallProductScaleCells.filter((node) => Boolean(node.querySelector('[data-product-scale-bars="true"]'))).length,
    tmallProductScaleMomLineVisualCount: tmallProductScaleCells.filter((node) => Boolean(node.querySelector('[data-product-momentum-line="true"]'))).length,
    tmallProductTrendHeaders,
    tmallProductTrendColumnWidths,
    tmallProductTrendVisibleMonthLabels,
    tmallProductTrendRowCount,
    tmallProductTrendTablePresent: Boolean(tmallProductTrendTable),
    title: document.title,
    tocDeepLinkTargetIds: [...document.querySelectorAll('main [id]')].map((node) => node.id),
    tocNavSummaries,
    viteErrorOverlay: Boolean(document.querySelector('vite-error-overlay')),
  };
}

export function captureSpecialReportIndexSnapshot() {
  const documentElement = document.documentElement;
  const bodyText = document.body?.innerText?.trim() ?? '';
  const board = document.querySelector('[data-special-report-chart-gallery-board]');
  const cards = board ? [...board.querySelectorAll('[data-chart-reference-fixture-id]')] : [];
  const frames = board ? [...board.querySelectorAll('[data-chart-reference-frame]')] : [];
  const previewKindAttribute = 'data-chart-reference-preview-kind';
  const viewportWidth = documentElement.clientWidth;
  const cardSummaries = cards.map((card) => {
    const rect = card.getBoundingClientRect();
    return {
      claim: card.getAttribute('data-chart-reference-claim') ?? '',
      fixtureId: card.getAttribute('data-chart-reference-fixture-id') ?? '',
      hasFrameKind: Boolean(card.getAttribute('data-chart-reference-frame-kind')?.trim()),
      hasLabelCount: Boolean(card.getAttribute('data-chart-reference-label-count')?.trim()),
      hasMarkCount: Boolean(card.getAttribute('data-chart-reference-mark-count')?.trim()),
      hasMobilePolicy: Boolean(card.getAttribute('data-chart-reference-mobile-policy')?.trim()),
      hasPalette: Boolean(card.querySelector('[data-chart-reference-palette]')?.getAttribute('data-chart-reference-palette')?.trim()),
      hasPreview: Boolean(card.querySelector(`[${previewKindAttribute}]`)),
      hasQuestion: Boolean(card.getAttribute('data-chart-reference-question')?.trim()),
      template: card.getAttribute('data-chart-reference-template') ?? '',
      viewportOverflow: rect.left < -2 || rect.right > viewportWidth + 2,
      width: Math.round(rect.width),
    };
  });

  return {
    bodyText,
    bodyTextLength: bodyText.length,
    bodyTextSample: bodyText.slice(0, 500),
    cardCount: cards.length,
    cardMaxWidth: Math.max(0, ...cardSummaries.map((card) => card.width)),
    cardViewportOverflowCount: cardSummaries.filter((card) => card.viewportOverflow).length,
    claimHandleCount: cardSummaries.filter((card) => card.claim.trim()).length,
    finalPath: window.location.pathname,
    finalSearch: window.location.search,
    frameCount: frames.length,
    hasBoard: Boolean(board),
    hasRoot: Boolean(document.getElementById('root')),
    horizontalOverflow: documentElement.scrollWidth > documentElement.clientWidth + 2,
    labelCountHandleCount: cardSummaries.filter((card) => card.hasLabelCount).length,
    markCountHandleCount: cardSummaries.filter((card) => card.hasMarkCount).length,
    mobilePolicyHandleCount: cardSummaries.filter((card) => card.hasMobilePolicy).length,
    paletteHandleCount: cardSummaries.filter((card) => card.hasPalette).length,
    previewCount: cardSummaries.filter((card) => card.hasPreview).length,
    questionHandleCount: cardSummaries.filter((card) => card.hasQuestion).length,
    templateIds: cardSummaries.map((card) => card.template),
    title: document.title,
    viteErrorOverlay: Boolean(document.querySelector('vite-error-overlay')),
  };
}

export async function captureMobileCompactFallbackSnapshot(fallbacks) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getCurrentNode = () => document.querySelector('nav[data-toc-mode="mobile"] [data-toc-current-entry-id]');
  const results = [];

  for (const fallback of fallbacks) {
    const target = document.getElementById(fallback.microId);
    if (!target) {
      results.push({
        activeTargetId: '',
        actualEntryId: '',
        expectedEntryId: fallback.parentId,
        microId: fallback.microId,
        summaryText: '',
        targetExists: false,
      });
      continue;
    }

    target.scrollIntoView({ block: 'start' });
    window.location.hash = encodeURIComponent(fallback.microId);
    window.dispatchEvent(new Event('scroll'));
    await sleep(320);

    const currentNode = getCurrentNode();
    results.push({
      activeTargetId: currentNode?.getAttribute('data-toc-active-target-id') ?? '',
      actualEntryId: currentNode?.getAttribute('data-toc-current-entry-id') ?? '',
      expectedEntryId: fallback.parentId,
      microId: fallback.microId,
      summaryText: currentNode?.innerText?.replace(/\s+/g, ' ').trim() ?? '',
      targetExists: true,
    });
  }

  return { results };
}
