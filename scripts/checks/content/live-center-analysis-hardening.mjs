#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

async function readSource(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

async function importBundledTs(relativePath) {
  const result = await build({
    alias: {
      '@': path.join(REPO_ROOT, 'apps/web-vite/src'),
    },
    entryPoints: [path.join(REPO_ROOT, relativePath)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    logLevel: 'silent',
  });
  const source = result.outputFiles?.[0]?.text;
  assert.ok(source, `expected esbuild to bundle ${relativePath}`);
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const resultCardSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_components/live-center-analysis-result-card.tsx'
);
const playbackHookSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_components/use-analysis-result-playback.ts'
);
const playbackPanelSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_components/live-center-analysis-result-playback-panel.tsx'
);
const playbackUtilsSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_components/live-center-analysis-result-utils.tsx'
);
const resultClientSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_components/live-center-analysis-result-client.tsx'
);
const helperSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_components/live-center-analysis-result-card-helpers.ts'
);
const playbackHelperSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_components/live-center-analysis-result-playback-helpers.ts'
);
const recordingSegmentHelperSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-recording-segment-helpers.ts'
);
const viewHelperSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-view-helpers.ts'
);
const frontendTypesSource = await readSource(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-types.ts'
);
const processorSource = await readSource(
  'etl/groland_postgres/scripts/live_center_analysis/processor.py'
);
const packageSource = await readSource('package.json');

assert.match(
  packageSource,
  /"verify:content:live-center-analysis-hardening":\s*"node scripts\/checks\/content\/live-center-analysis-hardening\.mjs"/u,
  'package.json should expose the live-center analysis hardening gate'
);

assert.match(
  resultCardSource,
  /useAnalysisResultPlayback/u,
  'AnalysisResultCard should delegate playback orchestration to useAnalysisResultPlayback'
);
assert.doesNotMatch(
  resultCardSource,
  /createLiveCenterPlaybackUrl/u,
  'AnalysisResultCard must not fetch playback URLs directly'
);
for (const forbiddenStateMarker of [
  'setPlaybackSeekStatus',
  'setPlaybackLoadingKey',
  'applyPlaybackSeek',
]) {
  assert.doesNotMatch(
    resultCardSource,
    new RegExp(forbiddenStateMarker, 'u'),
    `AnalysisResultCard should not own playback state marker ${forbiddenStateMarker}`
  );
}

assert.match(
  playbackHookSource,
  /export function useAnalysisResultPlayback/u,
  'route-local playback hook should export useAnalysisResultPlayback'
);
assert.match(
  playbackHookSource,
  /createLiveCenterPlaybackUrl/u,
  'playback hook should own signed playback URL fetching'
);
assert.match(
  playbackHookSource,
  /useRef<HTMLVideoElement \| null>/u,
  'playback hook should own the video ref'
);
for (const hookReturnMarker of [
  'playbackSeekMessage',
  'isTimeAnchorPlayable',
  'playTimeAnchor',
  'closePlayback',
  'clearPlaybackError',
  'handlePlaybackLoadedMetadata',
  'handlePlaybackRetrySeek',
  'handlePlaybackSeekStatusChange',
  'handlePlaybackSeeked',
]) {
  assert.match(
    playbackHookSource,
    new RegExp(hookReturnMarker, 'u'),
    `playback hook should expose ${hookReturnMarker}`
  );
}
for (const hookHardeningMarker of [
  'playbackRequestSeqRef',
  'playbackResolverCacheRef',
  'playbackSeekTimerRef',
  'playbackScopeKeyRef',
  'buildAnalysisResultPlaybackScopeKey',
  'window.clearTimeout',
  'refreshPlaybackUrl',
]) {
  assert.match(
    playbackHookSource,
    new RegExp(hookHardeningMarker, 'u'),
    `playback hook should guard async race/timer cleanup via ${hookHardeningMarker}`
  );
}
assert.match(
  playbackHookSource,
  /useEffect\(\(\) => \{[\s\S]*playbackRequestSeqRef\.current \+= 1[\s\S]*setPlayback\(null\)[\s\S]*playbackScopeKey/u,
  'playback hook should invalidate stale playback panels and requests when recording segment scope changes'
);
assert.match(
  playbackHookSource,
  /isPlaybackRequestCurrent = \(requestSeq: number, requestScopeKey: string\)[\s\S]*playbackScopeKeyRef\.current === requestScopeKey/u,
  'playback hook should compare request scope before writing signed playback URLs'
);
assert.match(
  playbackHookSource,
  /createLiveCenterPlaybackUrl\(playback\.recordingId, requestSegmentId\)/u,
  'video_error retry should refresh the signed playback URL instead of only reseeking the old video src'
);
assert.match(
  playbackHookSource,
  /playbackSeekStatus === 'video_error'[\s\S]*refreshPlaybackUrl/u,
  'video_error retry should be routed to playback URL refresh'
);
assert.match(
  playbackPanelSource,
  /playbackSeekStatus === 'video_error' \? '刷新播放地址' : '重新定位'/u,
  'playback panel should label video_error retry as signed URL refresh'
);
assert.match(
  playbackPanelSource,
  /disabled=\{playbackSeekStatus !== 'video_error' && !isFiniteNumber\(playback\.seekSeconds\)\}/u,
  'video_error retry should remain enabled even when playback starts at the segment head'
);
assert.match(
  resultClientSource,
  /refetchOnMount:\s*'always'/u,
  'analysis result detail query should refresh on mount instead of inheriting stale global cache policy'
);
assert.match(
  resultClientSource,
  /staleTime:\s*0/u,
  'analysis result detail query should keep recording segments fresh for playback positioning'
);

assert.match(
  frontendTypesSource,
  /displaySegmentIndex\?:\s*number\s*\|\s*null/u,
  'LiveCenterRecordingSegment should carry displaySegmentIndex for visible recording labels'
);
assert.match(
  playbackHelperSource,
  /export function createAnalysisResultPlaybackResolver/u,
  'playback target resolution should live in a focused playback helper'
);
assert.match(
  playbackHelperSource,
  /offsetStartSeconds/u,
  'resolvePlaybackTarget should consider absolute recording offsets'
);
assert.match(
  playbackHelperSource,
  /durationSeconds/u,
  'resolvePlaybackTarget should infer end offsets from segment duration when needed'
);
assert.match(
  playbackHelperSource,
  /isLiveCenterRecordingSegmentPlayable/u,
  'resolvePlaybackTarget should use the shared route-local playable segment predicate'
);
assert.match(
  recordingSegmentHelperSource,
  /uploadStatus === 'uploaded' && processingStatus !== 'deleted' && processingStatus !== 'skipped'/u,
  'shared playable segment predicate should require uploaded and exclude deleted/skipped segments'
);
assert.match(
  processorSource,
  /return upload_status == "uploaded" and processing_status not in \{"deleted", "skipped"\}/u,
  'processor playable segment predicate should match frontend strict uploaded-only semantics'
);
assert.doesNotMatch(
  processorSource,
  /matches\[0\] if matches else None/u,
  'processor segment lookup should not fallback to non-playable matches for anchor inference'
);
assert.match(
  playbackHelperSource,
  /offsetEndSeconds - 0\.001/u,
  'end-only playback anchors should use an end-exclusive probe offset for segment lookup'
);
assert.doesNotMatch(
  helperSource,
  /resolvePlaybackTarget/u,
  'card helpers should not grow playback target orchestration after the playback split'
);
assert.match(
  viewHelperSource,
  /const displaySegmentIndex = parseAnalysisNumberLike\(segment\.displaySegmentIndex\) \?\? ordinal/u,
  'analysis view model should preserve recording displaySegmentIndex instead of only using local ordinals'
);
assert.match(
  viewHelperSource,
  /isLiveCenterRecordingSegmentPlayable/u,
  'analysis view model should share the same playable segment predicate used by playback'
);
assert.match(
  playbackUtilsSource,
  /offsetEndSeconds !== null[\s\S]*`end:\$\{anchor\.offsetEndSeconds\}`/u,
  'time-anchor loading keys should include offsetEndSeconds for end-only anchors'
);
assert.match(
  playbackUtilsSource,
  /displaySegmentIndex !== null \? `display:\$\{anchor\.displaySegmentIndex\}`/u,
  'time-anchor loading keys should include displaySegmentIndex when raw segmentIndex is absent'
);

const {
  buildAnalysisResultPlaybackScopeKey,
  createAnalysisResultPlaybackResolver,
  resolvePlaybackSegmentLabel,
  resolvePlaybackTarget,
} = await importBundledTs(
  'apps/web-vite/src/app/content/live-center/_components/live-center-analysis-result-playback-helpers.ts'
);
const { buildAnalysisResultViewModel } = await importBundledTs(
  'apps/web-vite/src/app/content/live-center/_lib/live-center-view-helpers.ts'
);

const recording = {
  recordingId: 'recording-1',
  status: 'uploaded',
  segments: [
    {
      segmentId: 'segment-1',
      recordingId: 'recording-1',
      segmentIndex: 1,
      displaySegmentIndex: 1,
      fileName: 'part-1.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 100,
      durationSeconds: 3600,
      startOffsetSeconds: 0,
      endOffsetSeconds: 3600,
      uploadStatus: 'uploaded',
      processingStatus: 'completed',
      uploadedAt: '2026-07-08T00:00:00Z',
    },
    {
      segmentId: 'segment-2',
      recordingId: 'recording-1',
      segmentIndex: 2,
      displaySegmentIndex: 2,
      fileName: 'part-2.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 100,
      durationSeconds: 3600,
      startOffsetSeconds: 3600,
      endOffsetSeconds: 7200,
      uploadStatus: 'uploaded',
      processingStatus: 'completed',
      uploadedAt: '2026-07-08T00:00:00Z',
    },
    {
      segmentId: 'segment-3',
      recordingId: 'recording-1',
      segmentIndex: 3,
      displaySegmentIndex: 3,
      fileName: 'part-3.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 100,
      durationSeconds: 3600,
      startOffsetSeconds: 7200,
      endOffsetSeconds: 10800,
      uploadStatus: 'deleted',
      processingStatus: 'skipped',
      uploadedAt: null,
    },
  ],
};

const explicitTarget = resolvePlaybackTarget(recording, {
  clockTimeRange: null,
  displayTimeRange: null,
  displaySegmentIndex: 2,
  minuteRangeLabel: null,
  offsetEndSeconds: 3720,
  offsetRange: null,
  offsetStartSeconds: 3660,
  segmentIndex: 2,
  segmentLabel: null,
  sliceIndex: null,
});
assert.equal(explicitTarget?.segment.segmentId, 'segment-2', 'explicit segmentIndex should resolve uploaded segment');
assert.equal(explicitTarget?.seekSeconds, 60, 'seek offset should be relative to segment start offset');

const inferredTarget = resolvePlaybackTarget(recording, {
  clockTimeRange: null,
  displayTimeRange: null,
  displaySegmentIndex: null,
  minuteRangeLabel: null,
  offsetEndSeconds: 3720,
  offsetRange: null,
  offsetStartSeconds: 3660,
  segmentIndex: null,
  segmentLabel: null,
  sliceIndex: null,
});
assert.equal(inferredTarget?.segment.segmentId, 'segment-2', 'offset-only anchor should infer the uploaded segment');
assert.equal(inferredTarget?.seekSeconds, 60, 'offset-only anchor should still calculate relative seek seconds');

const endBoundaryTarget = resolvePlaybackTarget(recording, {
  clockTimeRange: null,
  displayTimeRange: null,
  displaySegmentIndex: null,
  minuteRangeLabel: null,
  offsetEndSeconds: 3600,
  offsetRange: null,
  offsetStartSeconds: null,
  segmentIndex: null,
  segmentLabel: null,
  sliceIndex: null,
});
assert.equal(
  endBoundaryTarget?.segment.segmentId,
  'segment-1',
  'end-only anchors at a segment boundary should resolve the segment that just ended'
);
assert.equal(
  endBoundaryTarget?.seekSeconds,
  3600,
  'end-only boundary seek should keep the real end offset and let the video seek clamp handle duration bounds'
);

const conflictTarget = resolvePlaybackTarget(recording, {
  clockTimeRange: null,
  displayTimeRange: null,
  displaySegmentIndex: 1,
  minuteRangeLabel: null,
  offsetEndSeconds: 3720,
  offsetRange: null,
  offsetStartSeconds: 3660,
  segmentIndex: 1,
  segmentLabel: '录屏 #1',
  sliceIndex: null,
});
assert.equal(conflictTarget?.segment.segmentId, 'segment-2', 'absolute offsets should override stale explicit segment indexes');
assert.equal(conflictTarget?.seekSeconds, 60, 'stale explicit segment indexes should not create wrong long seeks');

assert.equal(
  resolvePlaybackSegmentLabel(
    {
      clockTimeRange: null,
      displayTimeRange: null,
      displaySegmentIndex: 1,
      minuteRangeLabel: null,
      offsetEndSeconds: 3720,
      offsetRange: null,
      offsetStartSeconds: 3660,
      segmentIndex: 1,
      segmentLabel: '录屏 #1',
      sliceIndex: null,
    },
    {
      ...recording.segments[1],
      segmentIndex: 4,
      displaySegmentIndex: 3,
    }
  ),
  '录屏 #3',
  'playback panel labels should prefer the resolved segment display index over stale anchor labels'
);

const deletedTarget = resolvePlaybackTarget(recording, {
  clockTimeRange: null,
  displayTimeRange: null,
  displaySegmentIndex: 3,
  minuteRangeLabel: null,
  offsetEndSeconds: 7260,
  offsetRange: null,
  offsetStartSeconds: 7200,
  segmentIndex: 3,
  segmentLabel: null,
  sliceIndex: null,
});
assert.equal(deletedTarget, null, 'deleted/skipped segments must not become playable');

const skippedOverlapRecording = {
  ...recording,
  segments: [
    recording.segments[0],
    {
      ...recording.segments[1],
      segmentId: 'segment-skipped',
      segmentIndex: 2,
      displaySegmentIndex: 2,
      processingStatus: 'skipped',
      startOffsetSeconds: 3600,
      endOffsetSeconds: 7200,
    },
    {
      ...recording.segments[1],
      segmentId: 'segment-4',
      segmentIndex: 4,
      displaySegmentIndex: 3,
      processingStatus: 'completed',
      startOffsetSeconds: 3600,
      endOffsetSeconds: 7200,
    },
  ],
};
const skippedOverlapTarget = resolvePlaybackTarget(skippedOverlapRecording, {
  clockTimeRange: null,
  displayTimeRange: null,
  displaySegmentIndex: null,
  minuteRangeLabel: null,
  offsetEndSeconds: 3720,
  offsetRange: null,
  offsetStartSeconds: 3660,
  segmentIndex: null,
  segmentLabel: null,
  sliceIndex: null,
});
assert.equal(skippedOverlapTarget?.segment.segmentId, 'segment-4', 'offset-only playback should skip non-playable overlapping segments');
assert.notEqual(
  buildAnalysisResultPlaybackScopeKey(recording),
  buildAnalysisResultPlaybackScopeKey(skippedOverlapRecording),
  'playback scope key should change when segment upload/processing state changes'
);
const precomputedResolver = createAnalysisResultPlaybackResolver(skippedOverlapRecording);
assert.equal(
  precomputedResolver.resolveTarget({
    clockTimeRange: null,
    displayTimeRange: null,
    displaySegmentIndex: null,
    minuteRangeLabel: null,
    offsetEndSeconds: 3720,
    offsetRange: null,
    offsetStartSeconds: 3660,
    segmentIndex: null,
    segmentLabel: null,
    sliceIndex: null,
  })?.segment.segmentId,
  'segment-4',
  'precomputed playback resolver should reuse segment windows without changing target semantics'
);
assert.equal(
  precomputedResolver.hasPlayableSegment('segment-skipped'),
  false,
  'precomputed playback resolver should expose stale-panel invalidation for skipped/deleted segments'
);

const missingOffsetTarget = resolvePlaybackTarget(
  {
    ...recording,
    segments: [{
      ...recording.segments[1],
      startOffsetSeconds: null,
      endOffsetSeconds: null,
      durationSeconds: 3600,
    }],
  },
  {
    clockTimeRange: null,
    displayTimeRange: null,
    displaySegmentIndex: null,
    minuteRangeLabel: null,
    offsetEndSeconds: 3720,
    offsetRange: null,
    offsetStartSeconds: 3660,
    segmentIndex: null,
    segmentLabel: null,
    sliceIndex: null,
  }
);
assert.equal(missingOffsetTarget, null, 'offset-only anchors should not fake playback without segment start offsets');

const viewModel = buildAnalysisResultViewModel(
  {
    analysisId: 'analysis-1',
    analysisJson: {
      summary: '测试摘要',
      executiveReview: {
        verdict: 'optimize',
        oneSentenceConclusion: '关键 CTA 可复制。',
        whyNow: '成交分钟与口播证据能互相支撑。',
      },
      primaryDecision: {
        decision: 'optimize',
        reason: '复用高峰前动作。',
      },
      momentReviews: [
        {
          timeAnchor: {
            displayTimeRange: '录屏待定位',
            offsetStartSeconds: 3660,
            offsetEndSeconds: 3720,
          },
          title: 'offset-only CTA',
          whatHappened: '主播补充一号链接动作。',
          operatorRead: '该片段可用于复盘转化承接。',
          recommendedAction: '沉淀为下一场主播口播卡。',
        },
      ],
      evidenceLedger: [],
      speechScript: [],
      scriptReview: [],
      conversionDiagnosis: {},
      operatorScorecard: [],
      actionPlan: [],
      reviewTasks: [],
      analysisSelfEval: {},
      metrics: {},
      recording: {},
      input: {},
    },
    createdAt: '2026-07-08T00:00:00Z',
    status: 'succeeded',
  },
  {
    recording: {
      recordingId: 'recording-1',
      status: 'uploaded',
      segments: [
        {
          segmentId: 'segment-1',
          recordingId: 'recording-1',
          segmentIndex: 1,
          displaySegmentIndex: 1,
          fileName: 'part-1.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 100,
          durationSeconds: 3600,
          startOffsetSeconds: 0,
          endOffsetSeconds: 3600,
          uploadStatus: 'uploaded',
          processingStatus: 'completed',
          uploadedAt: '2026-07-08T00:00:00Z',
        },
        {
          segmentId: 'segment-skipped',
          recordingId: 'recording-1',
          segmentIndex: 2,
          displaySegmentIndex: 2,
          fileName: 'failed-part.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 100,
          durationSeconds: 3600,
          startOffsetSeconds: 3600,
          endOffsetSeconds: 7200,
          uploadStatus: 'uploaded',
          processingStatus: 'skipped',
          uploadedAt: '2026-07-08T00:00:00Z',
        },
        {
          segmentId: 'segment-4',
          recordingId: 'recording-1',
          segmentIndex: 4,
          displaySegmentIndex: 3,
          fileName: 'part-3.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: 100,
          durationSeconds: 3600,
          startOffsetSeconds: 3600,
          endOffsetSeconds: 7200,
          uploadStatus: 'uploaded',
          processingStatus: 'completed',
          uploadedAt: '2026-07-08T00:00:00Z',
        },
      ],
    },
    session: { liveStartTime: '2026-07-06T20:00:00' },
  }
);
const resolvedMomentAnchor = viewModel.momentReviewItems[0]?.timeAnchor;
assert.equal(resolvedMomentAnchor?.segmentIndex, 4, 'view model should infer the active segment from offset-only anchors');
assert.equal(resolvedMomentAnchor?.displaySegmentIndex, 3, 'view model should preserve API display segment index labels');
assert.equal(resolvedMomentAnchor?.segmentLabel, '录屏 #3', 'view model should use display labels for reader-facing segment text');
assert.match(resolvedMomentAnchor?.displayTimeRange ?? '', /录屏 #3/u, 'view model should replace generic pending labels after resolving anchors');
assert.doesNotMatch(resolvedMomentAnchor?.displayTimeRange ?? '', /待定位/u, 'resolved offset-only anchors should not still read as pending');

const staleExplicitViewModel = buildAnalysisResultViewModel(
  {
    analysisId: 'analysis-stale-explicit',
    analysisJson: {
      summary: '测试摘要',
      executiveReview: {
        verdict: 'optimize',
        oneSentenceConclusion: '关键 CTA 可复制。',
        whyNow: '成交分钟与口播证据能互相支撑。',
      },
      primaryDecision: { decision: 'optimize', reason: '复用高峰前动作。' },
      momentReviews: [
        {
          timeAnchor: {
            displaySegmentIndex: 1,
            offsetStartSeconds: 3660,
            offsetEndSeconds: 3720,
            segmentIndex: 1,
            segmentLabel: '录屏 #1',
          },
          title: 'stale explicit CTA',
          whatHappened: '主播补充一号链接动作。',
          operatorRead: '该片段可用于复盘转化承接。',
          recommendedAction: '沉淀为下一场主播口播卡。',
        },
      ],
      evidenceLedger: [],
      speechScript: [],
      scriptReview: [],
      conversionDiagnosis: {},
      operatorScorecard: [],
      actionPlan: [],
      reviewTasks: [],
      analysisSelfEval: {},
      metrics: {},
      recording: {},
      input: {},
    },
    createdAt: '2026-07-08T00:00:00Z',
    status: 'succeeded',
  },
  {
    recording: {
      recordingId: 'recording-1',
      status: 'uploaded',
      segments: [
        recording.segments[0],
        {
          ...recording.segments[1],
          segmentId: 'segment-4',
          segmentIndex: 4,
          displaySegmentIndex: 3,
        },
      ],
    },
    session: { liveStartTime: '2026-07-06T20:00:00' },
  }
);
const staleExplicitAnchor = staleExplicitViewModel.momentReviewItems[0]?.timeAnchor;
assert.equal(staleExplicitAnchor?.segmentIndex, 4, 'view model should let absolute offsets override stale explicit segment indexes');
assert.equal(staleExplicitAnchor?.displaySegmentIndex, 3, 'stale explicit display labels should be corrected by offset-resolved segments');
assert.equal(staleExplicitAnchor?.segmentLabel, '录屏 #3', 'reader-facing labels should follow the offset-resolved segment');

const snapshotInputSnapshot = {
  recording: {
    recordingId: 'snapshot-recording',
    segments: [
      {
        segmentId: 'snapshot-segment-1',
        segmentIndex: 1,
        displaySegmentIndex: 1,
        durationSeconds: 3600,
        startOffsetSeconds: 0,
        endOffsetSeconds: 3600,
        uploadStatus: 'uploaded',
        processingStatus: 'completed',
      },
      {
        segmentId: 'snapshot-segment-4',
        segmentIndex: 4,
        displaySegmentIndex: 3,
        durationSeconds: 3600,
        startOffsetSeconds: 3600,
        endOffsetSeconds: 7200,
        uploadStatus: 'uploaded',
        processingStatus: 'completed',
      },
    ],
  },
  session: { liveStartTime: '2026-07-06T20:00:00' },
};

const snapshotContextViewModel = buildAnalysisResultViewModel(
  {
    analysisId: 'analysis-snapshot',
    analysisJson: {
      summary: '测试摘要',
      executiveReview: {
        verdict: 'optimize',
        oneSentenceConclusion: '关键 CTA 可复制。',
        whyNow: '成交分钟与口播证据能互相支撑。',
      },
      primaryDecision: { decision: 'optimize', reason: '复用高峰前动作。' },
      momentReviews: [{
        timeAnchor: {
          offsetStartSeconds: 3660,
          offsetEndSeconds: 3720,
        },
        title: 'snapshot offset-only CTA',
        whatHappened: '主播补充一号链接动作。',
        operatorRead: '该片段可用于复盘转化承接。',
        recommendedAction: '沉淀为下一场主播口播卡。',
      }],
      evidenceLedger: [],
      speechScript: [],
      scriptReview: [],
      conversionDiagnosis: {},
      operatorScorecard: [],
      actionPlan: [],
      reviewTasks: [],
      analysisSelfEval: {},
      metrics: {},
      recording: {},
      input: {},
    },
    inputSnapshot: snapshotInputSnapshot,
    createdAt: '2026-07-08T00:00:00Z',
    status: 'succeeded',
  }
);
const snapshotAnchor = snapshotContextViewModel.momentReviewItems[0]?.timeAnchor;
assert.equal(snapshotAnchor?.segmentIndex, 4, 'view model should infer anchors from inputSnapshot.recording when live recording context is absent');
assert.equal(snapshotAnchor?.displaySegmentIndex, 3, 'inputSnapshot recording display labels should survive view-model normalization');

const displayOnlyViewModel = buildAnalysisResultViewModel(
  {
    analysisId: 'analysis-display-only',
    analysisJson: {
      summary: '测试摘要',
      executiveReview: {
        verdict: 'optimize',
        oneSentenceConclusion: '关键 CTA 可复制。',
        whyNow: '成交分钟与口播证据能互相支撑。',
      },
      primaryDecision: { decision: 'optimize', reason: '复用高峰前动作。' },
      momentReviews: [{
        timeAnchor: {
          displayTimeRange: '20:01:00-20:02:00｜录屏 #3',
          displaySegmentIndex: 3,
          segmentIndex: 4,
        },
        title: 'persisted display label',
        whatHappened: '主播补充一号链接动作。',
        operatorRead: '该片段可用于复盘转化承接。',
        recommendedAction: '沉淀为下一场主播口播卡。',
      }],
      evidenceLedger: [],
      speechScript: [],
      scriptReview: [],
      conversionDiagnosis: {},
      operatorScorecard: [],
      actionPlan: [],
      reviewTasks: [],
      analysisSelfEval: {},
      metrics: {},
      recording: {},
      input: {},
    },
    createdAt: '2026-07-08T00:00:00Z',
    status: 'succeeded',
  }
);
const displayOnlyAnchor = displayOnlyViewModel.momentReviewItems[0]?.timeAnchor;
assert.equal(displayOnlyAnchor?.segmentIndex, 4, 'persisted raw segment index should remain available without recording context');
assert.equal(displayOnlyAnchor?.displaySegmentIndex, 3, 'persisted display segment index should not require live recording context');
assert.equal(displayOnlyAnchor?.segmentLabel, '录屏 #3', 'persisted display segment index should drive reader-facing labels');

const endOnlyViewModel = buildAnalysisResultViewModel(
  {
    analysisId: 'analysis-end-only',
    analysisJson: {
      summary: '测试摘要',
      executiveReview: {
        verdict: 'optimize',
        oneSentenceConclusion: '关键 CTA 可复制。',
        whyNow: '成交分钟与口播证据能互相支撑。',
      },
      primaryDecision: { decision: 'optimize', reason: '复用高峰前动作。' },
      momentReviews: [{
        timeAnchor: {
          offsetEndSeconds: 3720,
        },
        title: 'end-only anchor',
        whatHappened: '主播补充一号链接动作。',
        operatorRead: '该片段可用于复盘转化承接。',
        recommendedAction: '沉淀为下一场主播口播卡。',
      }],
      evidenceLedger: [],
      speechScript: [],
      scriptReview: [],
      conversionDiagnosis: {},
      operatorScorecard: [],
      actionPlan: [],
      reviewTasks: [],
      analysisSelfEval: {},
      metrics: {},
      recording: {},
      input: {},
    },
    inputSnapshot: snapshotInputSnapshot,
    createdAt: '2026-07-08T00:00:00Z',
    status: 'succeeded',
  }
);
const endOnlyAnchor = endOnlyViewModel.momentReviewItems[0]?.timeAnchor;
assert.equal(endOnlyAnchor?.segmentIndex, 4, 'view model should infer segment anchors from offsetEndSeconds when start offset is absent');
assert.equal(endOnlyAnchor?.displaySegmentIndex, 3, 'end-only anchors should preserve display labels after inference');

const endBoundaryViewModel = buildAnalysisResultViewModel(
  {
    analysisId: 'analysis-end-boundary',
    analysisJson: {
      summary: '测试摘要',
      executiveReview: {
        verdict: 'optimize',
        oneSentenceConclusion: '关键 CTA 可复制。',
        whyNow: '成交分钟与口播证据能互相支撑。',
      },
      primaryDecision: { decision: 'optimize', reason: '复用高峰前动作。' },
      momentReviews: [{
        timeAnchor: {
          offsetEndSeconds: 3600,
        },
        title: 'end-boundary anchor',
        whatHappened: '主播在第一段尾部补充 CTA。',
        operatorRead: '该片段可用于复盘转化承接。',
        recommendedAction: '沉淀为下一场主播口播卡。',
      }],
      evidenceLedger: [],
      speechScript: [],
      scriptReview: [],
      conversionDiagnosis: {},
      operatorScorecard: [],
      actionPlan: [],
      reviewTasks: [],
      analysisSelfEval: {},
      metrics: {},
      recording: {},
      input: {},
    },
    inputSnapshot: snapshotInputSnapshot,
    createdAt: '2026-07-08T00:00:00Z',
    status: 'succeeded',
  }
);
const endBoundaryAnchor = endBoundaryViewModel.momentReviewItems[0]?.timeAnchor;
assert.equal(endBoundaryAnchor?.segmentIndex, 1, 'view model should treat end-only segment boundaries as the segment that ended');
assert.equal(endBoundaryAnchor?.displaySegmentIndex, 1, 'end-only boundary anchors should keep display labels consistent with playback');

console.log('live-center analysis hardening checks passed');
