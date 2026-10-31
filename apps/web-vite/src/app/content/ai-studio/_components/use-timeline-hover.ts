import { type MouseEvent, useState } from 'react';

export type TimelineHover = ReturnType<typeof useTimelineHover>;

/** Time under the pointer, shown on the ruler with a guide line through the lanes. */
export function useTimelineHover(durationMs: number) {
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const pointerMs = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || durationMs <= 0) return null;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.round(ratio * durationMs);
  };
  const hoverProps = {
    onMouseMove: (event: MouseEvent<HTMLElement>) => setHoverMs(pointerMs(event)),
    onMouseLeave: () => setHoverMs(null),
  };
  return { hoverMs, pointerMs, hoverProps };
}
