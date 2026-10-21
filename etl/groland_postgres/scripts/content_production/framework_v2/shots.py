"""Shot cuts for framework v2: union of PySceneDetect AdaptiveDetector and ContentDetector cuts on the
worker's 360p/15fps proxy. On the 55-film corpus this recalls 151/153 framework boundaries within 1s
(research/p0a-results.md).
"""
MIN_SHOT_SEC = 0.15


def cut_times(proxy):
    from scenedetect import AdaptiveDetector, ContentDetector, detect

    cuts = set()
    for detector in (AdaptiveDetector, ContentDetector):
        for start, _ in detect(str(proxy), detector(), show_progress=False)[1:]:
            cuts.add(round(start.get_seconds(), 3))
    return sorted(cuts)


def spans(cuts, duration):
    """[(start, end)] seconds; flashes shorter than MIN_SHOT_SEC are not shots."""
    edges = [0.0, *cuts, duration]
    return [(a, b) for a, b in zip(edges, edges[1:]) if b - a > MIN_SHOT_SEC]
