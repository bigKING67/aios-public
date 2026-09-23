import { validate } from './project.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const seconds = value => String(Math.round(value * 1e9) / 1e9);

export function compose(project, canvas = project.canvas) {
  const { duration, frames } = validate(project);
  const { width, height } = canvas;
  const { fps } = project.canvas;
  const assets = new Map(project.assets.map(a => [a.id, a]));
  const elements = [], cues = [];
  const timing = (start, length, source = 0) => `data-start="${seconds(start)}" data-duration="${seconds(length)}" data-media-start="${seconds(source)}"`;
  let cursor = 0;
  project.clips.forEach((clip, index) => {
    const start = cursor / fps, length = clip.frames / fps;
    const asset = assets.get(clip.asset_id);
    elements.push(`<video id="picture-${index}" src="${asset.file}" ${timing(start, length, clip.in_seconds)} data-track-index="0" muted playsinline style="object-fit:${clip.fit}"></video>`);
    if (asset.audio && clip.volume > 0) elements.push(`<audio id="sound-${index}" src="${asset.file}" ${timing(start, length, clip.in_seconds)} data-track-index="10" data-volume="${clip.volume}"></audio>`);
    clip.captions.forEach(caption => {
      const from = Math.max(clip.in_seconds, caption.from);
      const to = Math.min(clip.in_seconds + length, caption.to);
      if (to <= from) return;
      const cue = { start: start + from - clip.in_seconds, end: start + to - clip.in_seconds, text: caption.text };
      const cueId = `caption-${cues.length}`;
      elements.push(`<div id="${cueId}" class="caption" data-start="${seconds(cue.start)}" data-duration="${seconds(cue.end - cue.start)}" data-track-index="20">${escape(cue.text)}</div>`);
      cues.push(cue);
    });
    cursor += clip.frames;
  });
  project.audio.forEach((track, index) => {
    const length = Math.min(track.frames, frames - track.start_frame) / fps;
    if (length <= 0 || track.volume === 0) return;
    elements.push(`<audio id="bed-${index}" src="${assets.get(track.asset_id).file}" ${timing(track.start_frame / fps, length, track.in_seconds)} data-track-index="${30 + index}" data-volume="${track.volume}"></audio>`);
  });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(project.title)}</title>
<script src="gsap.min.js"></script>
<style>html,body{margin:0;background:#000;overflow:hidden}#main{position:relative;width:${width}px;height:${height}px;background:#000}video{position:absolute;inset:0;width:100%;height:100%}.caption{position:absolute;left:7%;right:7%;bottom:8%;text-align:center;color:#fff;white-space:pre-wrap;font:600 ${Math.round(height * 0.052)}px/1.35 'PingFang SC','Noto Sans CJK SC',sans-serif;text-shadow:0 2px 4px #000;background:rgba(0,0,0,.65);padding:8px;border-radius:6px}</style></head>
<body><div id="main" data-composition-id="main" data-width="${width}" data-height="${height}" data-duration="${seconds(duration)}">${elements.join('\n')}</div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.to({}, {duration:${seconds(duration)}});window.__timelines.main=tl;</script></body></html>`;
  return { html, cues, duration, frames };
}

export function webVtt(cues) {
  const stamp = s => {
    const ms = Math.round(s * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  return `WEBVTT\n\n${cues.map(c => `${stamp(c.start)} --> ${stamp(c.end)}\n${escape(c.text).replace(/\r?\n\r?\n/g, '\n')}\n`).join('\n')}`;
}
