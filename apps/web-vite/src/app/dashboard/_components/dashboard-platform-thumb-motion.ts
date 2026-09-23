import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

const PLATFORM_THUMB_MIN_BASE_WIDTH = 1;
const PLATFORM_THUMB_FALLBACK_TRANSITION_DURATION_MS = 250;
const PLATFORM_THUMB_FALLBACK_TRANSITION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const PLATFORM_THUMB_VIEWPORT_POLL_INTERVAL_MS = 300;

type DashboardPlatformThumbTab<Key extends string> = {
  key: Key;
};

type PlatformThumbState = {
  baseWidth: number;
  originLeft: number;
  radiusX: number;
  radiusY: number;
  scaleX: number;
  ready: boolean;
};

type UseDashboardPlatformThumbOptions<Key extends string> = {
  activeTab: Key;
  visibleTabs: readonly DashboardPlatformThumbTab<Key>[];
};

const formatPlatformThumbTransform = (thumb: PlatformThumbState) => (
  `translate3d(${thumb.originLeft}px, 0, 0) scaleX(${thumb.scaleX.toFixed(4)})`
);

const formatPlatformThumbBorderRadius = (thumb: PlatformThumbState) => (
  `${thumb.radiusX.toFixed(2)}px / ${thumb.radiusY.toFixed(2)}px`
);

const parseTransitionDurationMs = (value: string) => {
  const trimmedValue = value.trim();
  if (trimmedValue.endsWith('ms')) {
    return Number.parseFloat(trimmedValue);
  }
  if (trimmedValue.endsWith('s')) {
    return Number.parseFloat(trimmedValue) * 1000;
  }
  return PLATFORM_THUMB_FALLBACK_TRANSITION_DURATION_MS;
};

export function useDashboardPlatformThumb<Key extends string>({
  activeTab,
  visibleTabs,
}: UseDashboardPlatformThumbOptions<Key>) {
  const platformRailRef = useRef<HTMLElement | null>(null);
  const platformThumbRef = useRef<HTMLSpanElement | null>(null);
  const platformButtonRefs = useRef(new Map<Key, HTMLButtonElement>());
  const hasMeasuredPlatformThumbRef = useRef(false);
  const previousPlatformThumbActiveTabRef = useRef<Key | null>(null);
  const previousPlatformThumbStateRef = useRef<PlatformThumbState | null>(null);
  const [platformThumb, setPlatformThumb] = useState<PlatformThumbState>({
    baseWidth: PLATFORM_THUMB_MIN_BASE_WIDTH,
    originLeft: 0,
    radiusX: 9999,
    radiusY: 9999,
    scaleX: 1,
    ready: false,
  });

  const registerPlatformButton = useCallback(
    (key: Key) => (node: HTMLButtonElement | null) => {
      if (node) {
        platformButtonRefs.current.set(key, node);
        return;
      }
      platformButtonRefs.current.delete(key);
    },
    []
  );

  const animatePlatformThumb = useCallback((nextThumb: PlatformThumbState) => {
    const thumbElement = platformThumbRef.current;
    const previousThumb = previousPlatformThumbStateRef.current;

    if (
      !thumbElement ||
      !previousThumb?.ready ||
      !nextThumb.ready
    ) {
      return;
    }

    const canAnimateThumb =
      typeof thumbElement.animate === 'function' &&
      typeof thumbElement.getAnimations === 'function';
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasThumbMotionChanged = !(
      previousThumb.baseWidth === nextThumb.baseWidth &&
      previousThumb.originLeft === nextThumb.originLeft &&
      Math.abs(previousThumb.radiusX - nextThumb.radiusX) < 0.01 &&
      Math.abs(previousThumb.radiusY - nextThumb.radiusY) < 0.01 &&
      Math.abs(previousThumb.scaleX - nextThumb.scaleX) < 0.001
    );

    if (!canAnimateThumb) {
      return;
    }

    const runningAnimations = thumbElement.getAnimations();

    if (
      document.visibilityState !== 'visible' ||
      prefersReducedMotion ||
      !hasThumbMotionChanged
    ) {
      runningAnimations.forEach((animation) => animation.cancel());
      return;
    }

    const computedStyle = window.getComputedStyle(thumbElement);
    const currentTransform = computedStyle.transform === 'none'
      ? formatPlatformThumbTransform(previousThumb)
      : computedStyle.transform;
    const transitionDurationMs = Math.min(
      parseTransitionDurationMs(computedStyle.getPropertyValue('--transition-duration-base')),
      220
    );
    const transitionEasing =
      computedStyle.getPropertyValue('--transition-easing-out').trim() ||
      computedStyle.getPropertyValue('--transition-easing-standard').trim() ||
      PLATFORM_THUMB_FALLBACK_TRANSITION_EASING;

    runningAnimations.forEach((animation) => animation.cancel());
    thumbElement.animate(
      [
        {
          borderRadius: formatPlatformThumbBorderRadius(previousThumb),
          transform: currentTransform,
        },
        {
          borderRadius: formatPlatformThumbBorderRadius(nextThumb),
          transform: formatPlatformThumbTransform(nextThumb),
        },
      ],
      {
        duration: transitionDurationMs,
        easing: transitionEasing,
      }
    );
  }, []);

  const updatePlatformThumb = useCallback((animate = false) => {
    const activeButton = platformButtonRefs.current.get(activeTab);
    if (!activeButton) {
      setPlatformThumb((previous) => {
        const nextThumb = previous.ready ? { ...previous, ready: false } : previous;
        previousPlatformThumbStateRef.current = nextThumb;
        return nextThumb;
      });
      return;
    }

    const baseWidth = Math.max(
      PLATFORM_THUMB_MIN_BASE_WIDTH,
      ...Array.from(platformButtonRefs.current.values()).map((button) => button.offsetWidth)
    );
    const activeWidth = Math.max(PLATFORM_THUMB_MIN_BASE_WIDTH, activeButton.offsetWidth);
    const scaleX = activeWidth / baseWidth;
    const radiusY = Math.max(PLATFORM_THUMB_MIN_BASE_WIDTH, activeButton.offsetHeight / 2);
    const nextThumb = {
      baseWidth,
      originLeft: activeButton.offsetLeft + activeWidth / 2 - baseWidth / 2,
      radiusX: radiusY / scaleX,
      radiusY,
      scaleX,
      ready: true,
    };

    if (animate) {
      animatePlatformThumb(nextThumb);
    }
    previousPlatformThumbStateRef.current = nextThumb;
    setPlatformThumb((previous) => (
      previous.ready === nextThumb.ready &&
      previous.baseWidth === nextThumb.baseWidth &&
      previous.originLeft === nextThumb.originLeft &&
      Math.abs(previous.radiusX - nextThumb.radiusX) < 0.01 &&
      Math.abs(previous.radiusY - nextThumb.radiusY) < 0.01 &&
      Math.abs(previous.scaleX - nextThumb.scaleX) < 0.001
        ? previous
        : nextThumb
    ));
  }, [activeTab, animatePlatformThumb]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let animationFrame: number | null = null;
    const getPlatformThumbViewportSignature = () => [
      window.innerWidth,
      window.innerHeight,
      window.visualViewport?.width ?? 0,
      window.visualViewport?.height ?? 0,
      window.devicePixelRatio,
    ].join(':');
    let lastViewportSignature = getPlatformThumbViewportSignature();
    const runPlatformThumbUpdate = () => {
      updatePlatformThumb(false);
      hasMeasuredPlatformThumbRef.current = true;
    };
    const cancelPlatformThumbFrame = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };
    const schedulePlatformThumbUpdate = () => {
      lastViewportSignature = getPlatformThumbViewportSignature();
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        runPlatformThumbUpdate();
      });
    };
    const schedulePlatformThumbUpdateIfViewportChanged = () => {
      const nextViewportSignature = getPlatformThumbViewportSignature();
      if (nextViewportSignature === lastViewportSignature) {
        return;
      }
      lastViewportSignature = nextViewportSignature;
      schedulePlatformThumbUpdate();
    };

    const shouldAnimateActiveTabMotion =
      hasMeasuredPlatformThumbRef.current &&
      previousPlatformThumbActiveTabRef.current !== null &&
      previousPlatformThumbActiveTabRef.current !== activeTab;
    previousPlatformThumbActiveTabRef.current = activeTab;
    updatePlatformThumb(shouldAnimateActiveTabMotion);
    hasMeasuredPlatformThumbRef.current = true;
    schedulePlatformThumbUpdate();

    const rail = platformRailRef.current;
    const activeButton = platformButtonRefs.current.get(activeTab);

    window.addEventListener('resize', schedulePlatformThumbUpdate);
    window.visualViewport?.addEventListener('resize', schedulePlatformThumbUpdate);
    const viewportRemeasureInterval = window.setInterval(
      schedulePlatformThumbUpdateIfViewportChanged,
      PLATFORM_THUMB_VIEWPORT_POLL_INTERVAL_MS
    );

    const removeViewportListeners = () => {
      window.removeEventListener('resize', schedulePlatformThumbUpdate);
      window.visualViewport?.removeEventListener('resize', schedulePlatformThumbUpdate);
      window.clearInterval(viewportRemeasureInterval);
    };

    if (!rail || !activeButton || typeof ResizeObserver === 'undefined') {
      return () => {
        cancelPlatformThumbFrame();
        removeViewportListeners();
      };
    }

    const resizeObserver = new ResizeObserver(schedulePlatformThumbUpdate);
    resizeObserver.observe(rail);
    Array.from(platformButtonRefs.current.values()).forEach((button) => {
      resizeObserver.observe(button);
    });

    return () => {
      cancelPlatformThumbFrame();
      removeViewportListeners();
      resizeObserver.disconnect();
    };
  }, [activeTab, updatePlatformThumb, visibleTabs]);

  const platformRailStyle = platformThumb.ready
    ? ({
      '--dashboard-platform-thumb-origin-left': `${platformThumb.originLeft}px`,
      '--dashboard-platform-thumb-base-width': `${platformThumb.baseWidth}px`,
      '--dashboard-platform-thumb-radius-x': `${platformThumb.radiusX.toFixed(2)}px`,
      '--dashboard-platform-thumb-radius-y': `${platformThumb.radiusY.toFixed(2)}px`,
      '--dashboard-platform-thumb-scale-x': platformThumb.scaleX.toFixed(4),
    } as CSSProperties)
    : undefined;

  return {
    platformRailRef,
    platformThumbRef,
    platformRailStyle,
    registerPlatformButton,
    isPlatformThumbReady: platformThumb.ready,
  };
}
