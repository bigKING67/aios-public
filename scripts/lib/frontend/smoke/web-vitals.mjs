export function installFrontendSmokeWebVitals() {
  const existing = globalThis.__frontendSmokeWebVitals;
  if (existing?.installed) {
    return;
  }

  const state = {
    cls: 0,
    inpEventCount: 0,
    inpMs: 0,
    inpObserverFloorMs: 16,
    installed: true,
    interactionProbeAttempted: false,
    interactionProbeCompleted: false,
    interactionProbeSelector: null,
    lcpMs: null,
    supported: {
      cls: false,
      inp: false,
      lcp: false,
    },
  };
  const observers = [];
  const interactionDurations = new Map();

  globalThis.__frontendSmokeWebVitals = state;
  globalThis.__frontendSmokeWebVitalObservers = observers;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.lcpMs = Number(entry.startTime.toFixed(2));
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
    observers.push(observer);
    state.supported.lcp = true;
  } catch {
    // Unsupported performance entries remain explicit in the captured evidence.
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          state.cls = Number((state.cls + entry.value).toFixed(4));
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
    observers.push(observer);
    state.supported.cls = true;
  } catch {
    // Unsupported performance entries remain explicit in the captured evidence.
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const interactionId = Number(entry.interactionId || 0);
        if (interactionId <= 0) {
          continue;
        }
        const duration = Number(entry.duration || 0);
        const previous = interactionDurations.get(interactionId) ?? 0;
        interactionDurations.set(interactionId, Math.max(previous, duration));
      }
      state.inpEventCount = interactionDurations.size;
      state.inpMs = Number(Math.max(0, ...interactionDurations.values()).toFixed(2));
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: state.inpObserverFloorMs });
    observers.push(observer);
    state.supported.inp = true;
  } catch {
    // Unsupported performance entries remain explicit in the captured evidence.
  }
}
