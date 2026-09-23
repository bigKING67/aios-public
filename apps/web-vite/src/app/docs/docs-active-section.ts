interface AnimationFrameScheduler {
  cancelFrame: (frameId: number) => void;
  requestFrame: (callback: FrameRequestCallback) => number;
}

export interface AnimationFrameCoalescer {
  cancel: () => void;
  schedule: () => void;
}

export function createAnimationFrameCoalescer(
  callback: () => void,
  scheduler: AnimationFrameScheduler,
): AnimationFrameCoalescer {
  let frameId: number | null = null;

  return {
    schedule: () => {
      if (frameId !== null) {
        return;
      }
      frameId = scheduler.requestFrame(() => {
        frameId = null;
        callback();
      });
    },
    cancel: () => {
      if (frameId === null) {
        return;
      }
      scheduler.cancelFrame(frameId);
      frameId = null;
    },
  };
}

export function resolveActiveSectionId(
  sectionIds: string[],
  referenceLine: number,
  readOffsetTop: (sectionId: string) => number | null,
): string {
  let beforeId = '';
  let beforeMax = Number.NEGATIVE_INFINITY;
  let afterId = sectionIds[0] ?? '';
  let afterMin = Number.POSITIVE_INFINITY;

  for (const id of sectionIds) {
    const offsetTop = readOffsetTop(id);
    if (offsetTop === null) {
      continue;
    }
    if (offsetTop <= referenceLine && offsetTop > beforeMax) {
      beforeId = id;
      beforeMax = offsetTop;
    }
    if (offsetTop > referenceLine && offsetTop < afterMin) {
      afterId = id;
      afterMin = offsetTop;
    }
  }

  return beforeId || afterId;
}
