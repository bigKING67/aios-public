import { douyinEmbedUrl } from '../_lib/competitor-api';
import styles from './competitor.module.css';

/**
 * Staged originals are deleted after analysis, so the drawer plays the work from Douyin itself.
 * The cross-origin player cannot be seeked from the page; it loads lazily with the drawer.
 */
export function CompetitorOriginalPlayer({ awemeId }: { awemeId: string }) {
  const src = douyinEmbedUrl(awemeId);
  if (!src) return null;
  return (
    <figure className={styles.original}>
      <iframe
        src={src}
        title="抖音原片播放器"
        loading="lazy"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      <figcaption>抖音官方播放器；作品被删除或设为私密后无法播放。</figcaption>
    </figure>
  );
}
