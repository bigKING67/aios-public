interface DashboardChartResizeTiming {
  cancelFrame: (frameId: number) => void;
  clearTimer: (timerId: number) => void;
  requestFrame: (callback: FrameRequestCallback) => number;
  setTimer: (callback: () => void, delayMs: number) => number;
}

export interface DashboardChartResizeScheduler {
  cancel: () => void;
  schedule: () => void;
}

export function createDashboardChartResizeScheduler(
  resize: () => void,
  timing: DashboardChartResizeTiming,
  settleDelayMs = 80,
): DashboardChartResizeScheduler {
  let frameId: number | null = null;
  let settleTimerId: number | null = null;

  const schedule = () => {
    if (frameId === null) {
      frameId = timing.requestFrame(() => {
        frameId = null;
        resize();
      });
    }

    if (settleTimerId !== null) {
      timing.clearTimer(settleTimerId);
    }
    settleTimerId = timing.setTimer(() => {
      settleTimerId = null;
      resize();
    }, settleDelayMs);
  };

  const cancel = () => {
    if (frameId !== null) {
      timing.cancelFrame(frameId);
      frameId = null;
    }
    if (settleTimerId !== null) {
      timing.clearTimer(settleTimerId);
      settleTimerId = null;
    }
  };

  return { schedule, cancel };
}
