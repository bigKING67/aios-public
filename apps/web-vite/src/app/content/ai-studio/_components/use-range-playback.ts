import { type RefObject, useCallback, useRef, useState } from 'react';

/** Keyframe snapping may land a programmatic seek slightly before the in-point. */
const SEEK_TOLERANCE_MS = 250;

/** Plays one source interval and pauses at its end; seeking outside it cancels the range. */
export function useRangePlayback(videoRef: RefObject<HTMLVideoElement | null>) {
  const rangeStartRef = useRef(0);
  const rangeEndRef = useRef<number | null>(null);
  const [currentMs, setCurrentMs] = useState(0);

  const playRange = useCallback((startMs: number, endMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    rangeStartRef.current = startMs;
    rangeEndRef.current = endMs;
    video.currentTime = startMs / 1000;
    void video.play().catch(() => {
      // Autoplay may be blocked; the native controls remain available.
    });
  }, [videoRef]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const ms = Math.round(video.currentTime * 1000);
    setCurrentMs(ms);
    if (rangeEndRef.current !== null && ms >= rangeEndRef.current) {
      rangeEndRef.current = null;
      video.pause();
    }
  }, [videoRef]);

  const onSeeking = useCallback(() => {
    const video = videoRef.current;
    if (!video || rangeEndRef.current === null) return;
    // A user seek outside the pending range ends range playback.
    const ms = Math.round(video.currentTime * 1000);
    if (ms >= rangeEndRef.current || ms < rangeStartRef.current - SEEK_TOLERANCE_MS) rangeEndRef.current = null;
  }, [videoRef]);

  /** Jumps to one time and plays from there (ends any pending range). */
  const seekTo = useCallback((ms: number) => {
    const video = videoRef.current;
    if (!video) return;
    rangeEndRef.current = null;
    video.currentTime = Math.max(0, ms) / 1000;
    setCurrentMs(Math.max(0, Math.round(ms)));
    void video.play().catch(() => {
      // Autoplay may be blocked; the native controls remain available.
    });
  }, [videoRef]);

  const readCurrentMs = useCallback(() => {
    const video = videoRef.current;
    return video ? Math.round(video.currentTime * 1000) : 0;
  }, [videoRef]);

  return { currentMs, playRange, seekTo, onTimeUpdate, onSeeking, readCurrentMs };
}
