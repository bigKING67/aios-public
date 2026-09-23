'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button } from 'antd';
import { HomeOutlined, ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/organisms/layout';
import { ProtectedRoute } from '@/components/protected-route';
import { resolveClientErrorMessage } from '@/lib/client-error';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  cleanupLiveCenterRecordingSegment,
  createLiveCenterAnalysisJob,
  createLiveCenterPlaybackUrl,
  fetchLiveCenterDateBounds,
  fetchLiveCenterSessionDetail,
  fetchLiveCenterSessions,
} from '../_lib/live-center-api';
import {
  LIVE_CENTER_WEEK_LOCALE,
  clampCustomRangeToLiveCenterBounds,
  clampDateToLiveCenterBounds,
  clampPickerValueToLiveCenterBounds,
  configureLiveCenterDayjsLocale,
  getInitialLiveCenterDateState,
  hasUsableLiveCenterDateBounds,
  normalizeLiveCenterDateBounds,
  resolveLiveCenterCurrentRange,
  type LiveCenterDateMode,
  type LiveCenterDateRangeValue,
} from '../_lib/live-center-date-range';
import { liveCenterQueryKeys } from '../_lib/live-center-query-keys';
import type {
  LiveCenterRecordingSegment,
  LiveCenterSession,
  LiveCenterSessionQueryParams,
} from '../_lib/live-center-types';
import { useLiveCenterRecordingUploadQueue } from '../_lib/live-center-recording-upload-queue';
import {
  buildMinuteOrderLineChartData,
  hasActiveAnalysis,
  isActiveAnalysisStatus,
  resolveUploadSegmentIndexes,
} from '../_lib/live-center-view-helpers';
import shellStyles from '../live-center-shell.module.css';
import styles from '../live-center.module.css';
import {
  LiveCenterDetailEmptyState,
  SessionDetail,
} from './live-center-session-detail';
import {
  LiveCenterSessionFilters,
  LiveCenterSessionListPanel,
} from './live-center-session-list';
import type { LiveCenterPlaybackState } from './live-center-shared';

configureLiveCenterDayjsLocale();

export function LiveCenterClient() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const initialDateState = useMemo(() => getInitialLiveCenterDateState(), []);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [dateMode, setDateMode] = useState<LiveCenterDateMode>(initialDateState.dateMode);
  const [dayValue, setDayValue] = useState(initialDateState.dayValue);
  const [weekValue, setWeekValue] = useState(initialDateState.weekValue);
  const [monthValue, setMonthValue] = useState(initialDateState.monthValue);
  const [yearValue, setYearValue] = useState(initialDateState.yearValue);
  const [customRange, setCustomRange] = useState<LiveCenterDateRangeValue>(initialDateState.customRange);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<LiveCenterPlaybackState | null>(null);
  const [analysisModel, setAnalysisModel] = useState('');

  const dateBoundsQuery = useQuery({
    queryKey: liveCenterQueryKeys.dateBounds(),
    queryFn: ({ signal }) => fetchLiveCenterDateBounds({ signal }),
    staleTime: 5 * 60 * 1000,
  });
  const availableDateBounds = useMemo(
    () => normalizeLiveCenterDateBounds(dateBoundsQuery.data),
    [dateBoundsQuery.data]
  );
  const isDateBoundsReady = hasUsableLiveCenterDateBounds(availableDateBounds);
  const dateBoundsStatus = dateBoundsQuery.isLoading
    ? 'loading'
    : dateBoundsQuery.error
      ? 'error'
      : isDateBoundsReady
        ? 'ready'
        : 'empty';
  const currentDateRange = useMemo(
    () => resolveLiveCenterCurrentRange(
      {
        customRange,
        dateMode,
        dayValue,
        monthValue,
        weekValue,
        yearValue,
      },
      isDateBoundsReady ? availableDateBounds : null
    ),
    [availableDateBounds, customRange, dateMode, dayValue, isDateBoundsReady, monthValue, weekValue, yearValue]
  );
  const queryParams = useMemo<LiveCenterSessionQueryParams>(
    () => ({
      endDate: currentDateRange.end.format('YYYY-MM-DD'),
      keyword,
      page,
      pageSize,
      startDate: currentDateRange.start.format('YYYY-MM-DD'),
    }),
    [currentDateRange.end, currentDateRange.start, keyword, page, pageSize]
  );

  useEffect(() => {
    if (!isDateBoundsReady) {
      return;
    }

    setDayValue((previousValue) => {
      const nextValue = clampDateToLiveCenterBounds(previousValue, availableDateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });
    setWeekValue((previousValue) => {
      const nextValue = clampPickerValueToLiveCenterBounds(
        previousValue,
        'week',
        availableDateBounds
      ).locale(LIVE_CENTER_WEEK_LOCALE);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });
    setMonthValue((previousValue) => {
      const nextValue = clampPickerValueToLiveCenterBounds(previousValue, 'month', availableDateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });
    setYearValue((previousValue) => {
      const nextValue = clampPickerValueToLiveCenterBounds(previousValue, 'year', availableDateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });
    setCustomRange((previousValue) => {
      const nextValue = clampCustomRangeToLiveCenterBounds(previousValue, availableDateBounds);
      return previousValue[0].isSame(nextValue[0], 'day') &&
        previousValue[1].isSame(nextValue[1], 'day')
        ? previousValue
        : nextValue;
    });
  }, [availableDateBounds, isDateBoundsReady]);

  const sessionsQuery = useQuery({
    queryKey: liveCenterQueryKeys.list(queryParams),
    queryFn: ({ signal }) => fetchLiveCenterSessions(queryParams, { signal }),
    placeholderData: keepPreviousData,
  });

  const sessions = (sessionsQuery.data?.items ?? []).filter(isGrolandSelfBroadcastSession);
  const totalSessions = sessionsQuery.data?.total ?? 0;

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSessionId || !sessions.some((session) => session.sessionId === selectedSessionId)) {
      setSelectedSessionId(sessions[0].sessionId);
    }
  }, [selectedSessionId, sessions]);

  const detailQuery = useQuery({
    queryKey: selectedSessionId
      ? liveCenterQueryKeys.detail(selectedSessionId)
      : [...liveCenterQueryKeys.root, 'detail', 'none'],
    queryFn: ({ signal }) => fetchLiveCenterSessionDetail(selectedSessionId!, { signal }),
    enabled: Boolean(selectedSessionId),
    refetchInterval: (query) => (hasActiveAnalysis(query.state.data?.analyses ?? []) ? 5000 : false),
  });

  const invalidateSessionData = useCallback(
    async (sessionId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: liveCenterQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: liveCenterQueryKeys.detail(sessionId) }),
      ]);
    },
    [queryClient]
  );

  const {
    clearStaleUploadProgressForSession,
    startUploadQueue,
    uploadProgress,
    uploadRunning,
  } = useLiveCenterRecordingUploadQueue({
    invalidateSessionData,
    notifyError: message.error,
    notifySuccess: message.success,
    notifyWarning: message.warning,
  });

  useEffect(() => {
    setPlayback(null);
    clearStaleUploadProgressForSession(selectedSessionId);
  }, [clearStaleUploadProgressForSession, selectedSessionId]);

  const selectedSession = detailQuery.data?.session
    ?? sessions.find((session) => session.sessionId === selectedSessionId)
    ?? null;
  const selectedUploadProgress = uploadProgress?.sessionId === selectedSessionId
    ? uploadProgress
    : null;

  const minuteChartData = useMemo(
    () => buildMinuteOrderLineChartData(detailQuery.data?.minuteMetrics ?? []),
    [detailQuery.data?.minuteMetrics]
  );

  const playbackMutation = useMutation({
    mutationFn: (segment: LiveCenterRecordingSegment & { recordingId: string }) =>
      createLiveCenterPlaybackUrl(segment.recordingId, segment.segmentId),
    onError: (error) => {
      message.error(resolveClientErrorMessage(error, '播放地址获取失败，请稍后重试。'));
      setPlayback(null);
    },
    onSuccess: (response, segment) => {
      setPlayback({
        contentType: response.contentType,
        expiresAt: response.expiresAt,
        fileName: segment.fileName || `分段 ${segment.segmentIndex}`,
        fileSizeBytes: response.fileSizeBytes,
        segmentId: segment.segmentId,
        url: response.url,
      });
    },
  });

  const cleanupSegmentMutation = useMutation({
    mutationFn: (segment: LiveCenterRecordingSegment & { recordingId: string; sessionId: string }) =>
      cleanupLiveCenterRecordingSegment(segment.recordingId, segment.segmentId),
    onError: (error) => {
      message.error(resolveClientErrorMessage(error, '录屏分段清理失败，请稍后重试。'));
    },
    onSuccess: async (_response, segment) => {
      if (playback?.segmentId === segment.segmentId) {
        setPlayback(null);
      }
      message.success('已清理未完成的录屏分段');
      await invalidateSessionData(segment.sessionId);
    },
  });

  const analysisMutation = useMutation({
    mutationFn: (sessionId: string) =>
      createLiveCenterAnalysisJob(sessionId, analysisModel.trim() ? { model: analysisModel.trim() } : {}),
    onError: (error) => {
      message.error(resolveClientErrorMessage(error, 'AI 分析任务创建失败，请稍后重试。'));
    },
    onSuccess: async (_response, sessionId) => {
      message.success('AI 分析任务已创建');
      await invalidateSessionData(sessionId);
    },
  });

  const handleApplySearch = () => {
    setKeyword(keywordInput.trim());
    setPage(1);
  };

  const handleResetFilters = () => {
    const nextDateState = getInitialLiveCenterDateState();
    setKeywordInput('');
    setKeyword('');
    setDateMode(nextDateState.dateMode);
    setDayValue(isDateBoundsReady
      ? clampDateToLiveCenterBounds(nextDateState.dayValue, availableDateBounds)
      : nextDateState.dayValue);
    setWeekValue(isDateBoundsReady
      ? clampPickerValueToLiveCenterBounds(nextDateState.weekValue, 'week', availableDateBounds)
        .locale(LIVE_CENTER_WEEK_LOCALE)
      : nextDateState.weekValue);
    setMonthValue(isDateBoundsReady
      ? clampPickerValueToLiveCenterBounds(nextDateState.monthValue, 'month', availableDateBounds)
      : nextDateState.monthValue);
    setYearValue(isDateBoundsReady
      ? clampPickerValueToLiveCenterBounds(nextDateState.yearValue, 'year', availableDateBounds)
      : nextDateState.yearValue);
    setCustomRange(isDateBoundsReady
      ? clampCustomRangeToLiveCenterBounds(nextDateState.customRange, availableDateBounds)
      : nextDateState.customRange);
    setPage(1);
  };

  const handleDateModeChange = (nextMode: LiveCenterDateMode) => {
    setDateMode(nextMode);
    setPage(1);
  };

  const handleDayValueChange = (nextValue: LiveCenterDateRangeValue[number]) => {
    setDayValue(nextValue.startOf('day'));
    setPage(1);
  };

  const handleWeekValueChange = (nextValue: LiveCenterDateRangeValue[number]) => {
    setWeekValue(nextValue.locale(LIVE_CENTER_WEEK_LOCALE));
    setPage(1);
  };

  const handleMonthValueChange = (nextValue: LiveCenterDateRangeValue[number]) => {
    setMonthValue(nextValue.startOf('month'));
    setPage(1);
  };

  const handleYearValueChange = (nextValue: LiveCenterDateRangeValue[number]) => {
    setYearValue(nextValue.startOf('year'));
    setPage(1);
  };

  const handleCustomRangeChange = (nextRange: LiveCenterDateRangeValue) => {
    setCustomRange(nextRange);
    setPage(1);
  };

  const handleUploadFiles = (files: File[]) => {
    if (!selectedSessionId) {
      message.warning('请先选择一场直播。');
      return;
    }
    if (files.length === 0) {
      message.warning('请选择至少 1 个录屏文件。');
      return;
    }
    const segmentIndexes = resolveUploadSegmentIndexes(
      detailQuery.data?.recording,
      selectedSession?.recordingSegmentCount,
      files.length
    );
    const started = startUploadQueue({
      files,
      segmentIndexes,
      sessionId: selectedSessionId,
    });
    if (!started) {
      message.warning('当前录屏队列仍在上传，请完成后再添加下一批。');
    }
  };

  const handlePlaySegment = (segment: LiveCenterRecordingSegment) => {
    const recordingId = detailQuery.data?.recording?.recordingId;
    if (!recordingId) {
      message.warning('当前场次还没有可播放的录屏集合。');
      return;
    }
    setPlayback(null);
    playbackMutation.mutate({
      ...segment,
      recordingId,
    });
  };

  const handleCleanupSegment = (segment: LiveCenterRecordingSegment) => {
    if (cleanupSegmentMutation.isPending) {
      message.info('正在清理上一段录屏，请完成后再操作。');
      return;
    }
    const recordingId = detailQuery.data?.recording?.recordingId;
    if (!recordingId || !selectedSessionId) {
      message.warning('当前场次还没有可清理的录屏集合。');
      return;
    }
    if (segment.uploadStatus?.trim().toLowerCase() === 'uploaded') {
      message.warning('已上传完成的录屏暂不支持直接清理。');
      return;
    }
    cleanupSegmentMutation.mutate({
      ...segment,
      recordingId,
      sessionId: selectedSessionId,
    });
  };

  const handleCreateAnalysis = () => {
    if (!selectedSessionId) {
      message.warning('请先选择一场直播。');
      return;
    }
    if (
      hasActiveAnalysis(detailQuery.data?.analyses ?? []) ||
      isActiveAnalysisStatus(selectedSession?.analysisStatus)
    ) {
      message.info('当前场次已有分析任务运行中，完成或失败后可再次触发。');
      return;
    }
    if (detailQuery.data?.recording && !hasUploadedRecordingSegment(detailQuery.data.recording.segments)) {
      message.warning('请先完成至少 1 段录屏上传，或清理残留后重新上传。');
      return;
    }
    analysisMutation.mutate(selectedSessionId);
  };

  const isInitialListError = !!sessionsQuery.error && !sessionsQuery.data;
  const showSessionEmpty = !sessionsQuery.isLoading && !isInitialListError && sessions.length === 0;

  return (
    <ProtectedRoute>
      <Layout variant="immersive">
        <main className={shellStyles.pageShell}>
          <section className={shellStyles.liveConsoleShell}>
            <header className={shellStyles.liveConsoleTopbar}>
              <div className={shellStyles.liveConsoleTitle}>
                <div className={shellStyles.liveConsoleTitleRow}>
                  <Link
                    aria-label="返回首页"
                    className={shellStyles.homeEntryLink}
                    title="返回首页"
                    to={ROUTE_PATHS.home}
                  >
                    <HomeOutlined className={shellStyles.homeEntryIcon} />
                  </Link>
                  <h1>直播中台</h1>
                </div>
              </div>
              <LiveCenterSessionFilters
                classNames={{
                  actions: shellStyles.topbarFilterActions,
                  controls: shellStyles.topbarFilterControls,
                  root: shellStyles.topbarFilters,
                }}
                availableDateBounds={availableDateBounds}
                customRange={customRange}
                dateBoundsStatus={dateBoundsStatus}
                dateMode={dateMode}
                dayValue={dayValue}
                isDateBoundsReady={isDateBoundsReady}
                keywordInput={keywordInput}
                monthValue={monthValue}
                weekValue={weekValue}
                yearValue={yearValue}
                onApplySearch={handleApplySearch}
                onCustomRangeChange={handleCustomRangeChange}
                onDateModeChange={handleDateModeChange}
                onDayValueChange={handleDayValueChange}
                onKeywordInputChange={setKeywordInput}
                onMonthValueChange={handleMonthValueChange}
                onResetFilters={handleResetFilters}
                onWeekValueChange={handleWeekValueChange}
                onYearValueChange={handleYearValueChange}
              />
              <div className={shellStyles.liveConsoleActions}>
                <Button
                  aria-label="刷新直播场次"
                  className={shellStyles.refreshButton}
                  icon={<ReloadOutlined />}
                  loading={sessionsQuery.isFetching}
                  onClick={() => sessionsQuery.refetch()}
                  title="刷新直播场次"
                >
                  刷新
                </Button>
              </div>
            </header>

            <section className={shellStyles.liveConsoleBody}>
              <aside className={shellStyles.sessionQueueRail} aria-label="直播场次队列">
                <LiveCenterSessionListPanel
                  classNames={{
                    list: shellStyles.sessionQueueListRail,
                    pagination: shellStyles.paginationRail,
                    root: shellStyles.sessionPanelRail,
                  }}
                  currentPage={sessionsQuery.data?.page ?? page}
                  currentPageSize={sessionsQuery.data?.pageSize ?? pageSize}
                  hasInitialListError={isInitialListError}
                  isFetching={sessionsQuery.isFetching}
                  isLoading={sessionsQuery.isLoading}
                  sessions={sessions}
                  sessionsError={sessionsQuery.error}
                  selectedSessionId={selectedSessionId}
                  showSessionEmpty={showSessionEmpty}
                  totalSessions={totalSessions}
                  onPageChange={(nextPage, nextPageSize) => {
                    setPage(nextPage);
                    setPageSize(nextPageSize);
                  }}
                  onRetry={() => sessionsQuery.refetch()}
                  onSelectSession={setSelectedSessionId}
                />
              </aside>

              <section className={shellStyles.reviewWorkspace} aria-label="直播场次复盘工作区">
                <section className={styles.detailColumn}>
                  {!selectedSessionId ? (
                    <LiveCenterDetailEmptyState />
                  ) : (
                    <SessionDetail
                      analysisModel={analysisModel}
                      analysisMutationLoading={analysisMutation.isPending}
                      detail={detailQuery.data}
                      detailError={detailQuery.error}
                      isDetailFetching={detailQuery.isFetching}
                      isDetailLoading={detailQuery.isLoading}
                      minuteChartData={minuteChartData}
                      playback={playback}
                      cleanupLoadingSegmentId={
                        cleanupSegmentMutation.isPending
                          ? cleanupSegmentMutation.variables?.segmentId ?? null
                          : null
                      }
                      playbackLoadingSegmentId={
                        playbackMutation.isPending ? playbackMutation.variables?.segmentId ?? null : null
                      }
                      selectedSession={selectedSession}
                      uploadProgress={selectedUploadProgress}
                      uploadRunning={uploadRunning}
                      onAnalysisModelChange={setAnalysisModel}
                      onCleanupSegment={handleCleanupSegment}
                      onCreateAnalysis={handleCreateAnalysis}
                      onPlaySegment={handlePlaySegment}
                      onRetryDetail={() => detailQuery.refetch()}
                      onUploadFiles={handleUploadFiles}
                    />
                  )}
                </section>
              </section>
            </section>
          </section>
        </main>
      </Layout>
    </ProtectedRoute>
  );
}

function isGrolandSelfBroadcastSession(session: LiveCenterSession): boolean {
  return session.anchorNickname?.trim().toLowerCase().startsWith('groland') ?? false;
}

function hasUploadedRecordingSegment(segments: LiveCenterRecordingSegment[]): boolean {
  return segments.some((segment) => segment.uploadStatus?.trim().toLowerCase() === 'uploaded');
}
