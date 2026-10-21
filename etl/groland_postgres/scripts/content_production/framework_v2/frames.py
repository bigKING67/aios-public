"""One forward decode of the original video for every frame the v2 stages sample.

Seeking (cv2 CAP_PROP_POS_MSEC) re-decodes from the previous keyframe for every sample: ~17s for the 168
OCR frames of a 1080p film on the GPU node, and persons / shot facts / OCR each seek again. cv2 maps a
seek to frame index int(t * fps + 0.5); a single forward pass that keeps those indices returns the
identical frames (pixel-equal on the 55-film corpus) in ~4s.
"""
import cv2


def resize(frame, width):
    return cv2.resize(frame, (width, int(frame.shape[0] * width / frame.shape[1])))


class Frames:
    """Resized frames keyed by (frame index, width); `get` returns None where the video had no frame."""

    def __init__(self, video, requests, tick=lambda: None):
        cap = cv2.VideoCapture(str(video))
        try:
            self.fps = cap.get(cv2.CAP_PROP_FPS)
            if not self.fps or self.fps <= 0:
                raise RuntimeError('framework v2 source has no frame rate')
            wanted = {}
            for t, width in requests:
                wanted.setdefault(self.index(t), set()).add(width)
            self._frames = {}
            last = max(wanted, default=-1)
            i = 0
            while i <= last:
                if i in wanted:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    for width in wanted[i]:
                        self._frames[(i, width)] = resize(frame, width)
                elif not cap.grab():
                    break
                if i % 300 == 0:
                    tick()
                i += 1
        finally:
            cap.release()

    def index(self, t):
        return int(t * self.fps + 0.5)

    def get(self, t, width):
        return self._frames.get((self.index(t), width))
