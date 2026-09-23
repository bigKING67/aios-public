import { extractSectionSource } from './special-report-section-source.mjs';

export function auditPublishedPlatformDetailOwners({ files, findings, paths }) {
  try {
    const snapshotData = JSON.parse(files[paths.contentData]);
    if (snapshotData?.meta?.bodyStatus !== 'published') {
      findings.push(`${paths.contentData} must keep the GSV report body explicitly published.`);
    }
  } catch (error) {
    findings.push(`${paths.contentData} is invalid JSON (${error.message}).`);
  }

  const sections = [
    [paths.tmallSection, 'tmall-wanxiangtai', 'TmallWanxiangtaiVisualBoard', 'TmallWanxiangtaiEvidence'],
    [paths.tmallSection, 'tmall-driver', 'TmallDriverVisualBoard', 'TmallDriverEvidence'],
    [paths.douyinSection, 'douyin-content-commerce', 'MetricStrip', 'DecisionSequence', '平台判断'],
    [paths.douyinSection, 'douyin-channel', 'DouyinChannelVisualBoard', 'DouyinChannelEvidence'],
    [paths.douyinSection, 'douyin-live', 'DouyinLiveVisualBoard', 'DouyinLiveEvidenceAppendix'],
    [paths.douyinSection, 'douyin-card', 'DouyinCardVisualBoard', 'DouyinCardEvidenceAppendix'],
    [paths.douyinSection, 'douyin-qianchuan', 'DouyinQianchuanVisualBoard', 'DouyinQianchuanEvidence'],
    [paths.douyinSection, 'douyin-short-video', 'DouyinShortVideoVisualBoard', 'DouyinShortVideoEvidence'],
  ];

  for (const [filePath, sectionId, ...requiredSnippets] of sections) {
    const sectionSource = extractSectionSource(files[filePath], sectionId);
    if (!sectionSource) {
      findings.push(`Published platform detail section "${sectionId}" is missing from ${filePath}.`);
      continue;
    }
    if (sectionSource.includes('<DraftPagePlaceholder />')) {
      findings.push(`Published platform detail section "${sectionId}" must not render a draft placeholder.`);
    }
    for (const snippet of requiredSnippets) {
      if (!sectionSource.includes(snippet)) {
        findings.push(`Published platform detail section "${sectionId}" must keep owner ${snippet}.`);
      }
    }
  }
}
