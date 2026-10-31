"""On-screen text of the 混剪口播 segments for the `text` selling-point input (GPU node only).

Reuses the framework v2 building blocks on the proxy: shot cuts, then one frame per second of each
shot clipped to a 混剪口播 segment, read by the shared GPU OCR engine. Lines that recur on more than
STATIC_SHARE of those shots (watermarks, filing numbers, disclaimers) are dropped, and consecutive shots
with the same text collapse into one line. Raises ScreenTextUnavailable where the framework-v2
dependencies or a CUDA GPU are missing (the VPS image), so the caller can fall back to the video input.
"""
MIN_SHOT_SEC = 0.3


class ScreenTextUnavailable(RuntimeError):
    pass


def voiceover_shots(spans, frames):
    """Shot spans clipped to the 混剪口播 segments, in seconds."""
    clipped = []
    for a, b in spans:
        for frame in frames:
            start, end = max(a, frame['start_ms'] / 1000), min(b, frame['end_ms'] / 1000)
            if end - start >= MIN_SHOT_SEC:
                clipped.append((round(start, 3), round(end, 3)))
    return sorted(set(clipped))


def lines_for(shot_rows, standing_text, is_standing):
    """`[start–end 秒] a / b` per shot, standing captions removed, repeats of the previous shot merged."""
    standing = standing_text(shot_rows)
    lines, previous = [], None
    for row in shot_rows:
        texts = list(dict.fromkeys(t for t in row['ocr'] if not is_standing(t, standing)))
        if texts and texts != previous:
            lines.append(f"[{row['start']:.1f}–{row['end']:.1f} 秒] " + ' / '.join(texts))
        previous = texts
    return lines


def screen_lines(source, proxy, frames, duration_ms, tick):
    """(lines, summary) for the 混剪口播 segments of one original."""
    try:
        from .framework_v2 import ocr, rules, shots
        from .framework_v2.frames import Frames
        engine = ocr.engine()
    except (ImportError, RuntimeError) as error:
        raise ScreenTextUnavailable(type(error).__name__) from error
    spans = voiceover_shots(shots.spans(shots.cut_times(proxy), duration_ms / 1000), frames)
    if not spans:
        return [], {'engine': ocr.ENGINE, 'shots': 0, 'lines': 0}
    decoded = Frames(source, ocr.frame_requests(spans), tick)
    texts, name = ocr.shot_text(decoded, spans, tick)
    del engine, decoded
    rows = [{'start': a, 'end': b, 'ocr': t} for (a, b), t in zip(spans, texts)]
    lines = lines_for(rows, rules._standing_text, rules._is_standing)
    return lines, {'engine': name, 'shots': len(spans), 'lines': len(lines)}
