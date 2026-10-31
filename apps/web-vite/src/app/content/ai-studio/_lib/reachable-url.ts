/**
 * A 视频云管家 original has two addresses for the same file: the outer-network one (reachable from home or
 * mobile data) and the inner-network one (the only one reachable inside the company). The browser cannot
 * tell which works before trying, and a dead address can hang for 20 seconds, so both are probed at once
 * and the first that answers wins. An answered connection is not enough: a local proxy (Clash and the
 * like) accepts every connection and only then fails or stalls the transfer, so a probe wins only when a
 * detached <video> has read the file's metadata (a few hundred KB, no CORS needed). A single address is
 * returned as is.
 */
import { useEffect, useState } from 'react';

export const PROBE_TIMEOUT_MS = 8000;

/** Resolves once `url` yields playable metadata, rejects on a media error; stops loading on abort. */
export type Probe = (url: string, signal: AbortSignal) => Promise<void>;

export const probeMetadata: Probe = (url, signal) => new Promise<void>((resolve, reject) => {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  const stop = () => {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
  };
  signal.addEventListener('abort', () => {
    stop();
    reject(new DOMException('aborted', 'AbortError'));
  }, { once: true });
  video.onloadedmetadata = () => {
    stop();
    resolve();
  };
  video.onerror = () => {
    stop();
    reject(new Error('media error'));
  };
  video.src = url;
});

/** The first of `urls` that yields metadata within the timeout; the first url when none does (the player then shows its error). */
export async function firstReachable(urls: string[], { timeoutMs = PROBE_TIMEOUT_MS, probe = probeMetadata } = {}): Promise<string> {
  if (urls.length <= 1) return urls[0];
  const controllers = urls.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach((controller) => controller.abort()), timeoutMs);
  try {
    // The first probe to resolve wins; when every probe fails, fall back to the first address.
    return await new Promise<string>((resolve) => {
      let failed = 0;
      urls.forEach((url, index) => {
        probe(url, controllers[index].signal).then(() => resolve(url), () => {
          failed += 1;
          if (failed === urls.length) resolve(urls[0]);
        });
      });
    });
  } finally {
    clearTimeout(timer);
    controllers.forEach((controller) => controller.abort());
  }
}

/** The playable address of a playback response: `url`, or the first reachable of `url` and its alternates. */
export function usePlayableUrl(playback: { url: string; alternateUrls?: string[] | null } | undefined): string | null {
  const key = playback ? [playback.url, ...(playback.alternateUrls ?? [])].join('\n') : '';
  const [chosen, setChosen] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!key) return undefined;
    const urls = key.split('\n');
    if (urls.length === 1) return undefined;
    let live = true;
    void firstReachable(urls).then((url) => {
      if (live) setChosen({ key, url });
    });
    return () => {
      live = false;
    };
  }, [key]);
  if (!playback) return null;
  if (!playback.alternateUrls?.length) return playback.url;
  return chosen?.key === key ? chosen.url : null;
}
