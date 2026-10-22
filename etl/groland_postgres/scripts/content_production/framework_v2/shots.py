"""Shot cuts for framework v2: union of PySceneDetect AdaptiveDetector and ContentDetector cuts on the
worker's 360p/15fps proxy. On the 55-film corpus this recalls 151/153 framework boundaries within 1s
(research/p0a-results.md).
"""
MIN_SHOT_SEC = 0.15


def cut_times(proxy):
    from scenedetect import AdaptiveDetector, ContentDetector, SceneManager, open_video

    # Keep both detectors and their independent state, sharing only video decoding.
    # A single detector changes the union and can remove business boundaries.
    manager = SceneManager()
    manager.add_detector(AdaptiveDetector())
    manager.add_detector(ContentDetector())
    video = open_video(str(proxy))
    manager.detect_scenes(video, show_progress=False)
    return sorted({round(start.get_seconds(), 3) for start, _ in manager.get_scene_list()[1:]})


def spans(cuts, duration):
    """[(start, end)] seconds; flashes shorter than MIN_SHOT_SEC are not shots."""
    edges = [0.0, *cuts, duration]
    return [(a, b) for a, b in zip(edges, edges[1:]) if b - a > MIN_SHOT_SEC]
