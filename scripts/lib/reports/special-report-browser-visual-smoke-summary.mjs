import {
  EXPECTED_CHART_GALLERY_CARD_COUNT,
} from './special-report-browser-visual-smoke.mjs';

export function printSpecialReportBrowserVisualSmokeSummary({ authState, baseUrl, engine, failures, results }) {
  console.log(`[special-report-browser-smoke] base_url=${baseUrl}`);
  console.log(`[special-report-browser-smoke] engine=${engine}`);
  console.log(`[special-report-browser-smoke] authState=${authState}`);
  console.log(`[special-report-browser-smoke] checked=${results.length}`);
  for (const result of results) {
    const overflow = result.horizontalOverflow ? ' overflow=fail' : '';
    if (result.kind === 'anonymous-redirect') {
      console.log(
        `[special-report-browser-smoke] ${result.viewport}px ${result.route} status=${result.status} anonymous_redirect=${result.redirectTarget || '<empty>'} final=${result.finalPath}${result.finalSearch || ''}`,
      );
    } else if (result.kind === 'gallery') {
      console.log(
        `[special-report-browser-smoke] ${result.viewport}px ${result.route} status=${result.status} gallery_cards=${result.cardCount}/${EXPECTED_CHART_GALLERY_CARD_COUNT} gallery_frames=${result.frameCount}/${EXPECTED_CHART_GALLERY_CARD_COUNT} previews=${result.previewCount}/${EXPECTED_CHART_GALLERY_CARD_COUNT} questions=${result.questionHandleCount}/${EXPECTED_CHART_GALLERY_CARD_COUNT} claims=${result.claimHandleCount}/${EXPECTED_CHART_GALLERY_CARD_COUNT} mobile_policies=${result.mobilePolicyHandleCount}/${EXPECTED_CHART_GALLERY_CARD_COUNT} card_max_w=${result.cardMaxWidth}${overflow} final=${result.finalPath}${result.finalSearch || ''}`,
      );
    } else {
      console.log(
        `[special-report-browser-smoke] ${result.viewport}px ${result.route} status=${result.status} charts=${result.chartRenderedCount}/${result.chartNodeCount} chart_meta_missing=${result.chartMissingSemanticMetadataCount} static_visuals=${result.staticVisualNonZeroBoxCount}/${result.staticVisualCount} static_visual_meta_missing=${result.staticVisualMissingSemanticMetadataCount} static_visual_max_h=${result.staticVisualMaxHeight} evidence=${result.evidenceDetailCount} section_evidence_max=${result.sectionEvidenceShownMax} toc_desktop=${result.desktopTocVisibleEntryCount}/${result.desktopTocEntryCount} toc_mobile=${result.mobileTocVisibleEntryCount}/${result.mobileTocEntryCount} mobile_toc_fallback_failures=${result.mobileCompactFallbackFailedCount} mobile_cells=${result.mobileEvidenceCellLabelCount}${overflow} final=${result.finalPath}${result.finalSearch || ''}`,
      );
    }
  }
  if (failures.length > 0) {
    console.error('[special-report-browser-smoke] failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('[special-report-browser-smoke] passed');
}
