"""Standalone mouth-opening probe, run by the MediaPipe interpreter (FRAMEWORK_V2_MOUTH_PYTHON).

MediaPipe pins numpy<2 and opencv-contrib, which conflict with the worker environment, so this file
imports only numpy, cv2 and mediapipe and talks JSON over stdin/stdout:

  stdin:  {"video": path, "model": face_landmarker.task path, "spans": [[start, end], ...]}
  stdout: {"mouth": [value or null per span]}

Per span: frames at FPS (one forward decode), largest face of up to two, inner-lip gap (landmarks
13/14) over face height (10/152), faces under 12% of the frame height ignored. The value is the
p90-p10 spread of that ratio, or null when fewer than 8 samples or under 60% of samples have a face.
"""
import json
import sys

import cv2
import numpy as np

FPS = 15.0
WIDTH = 480
MIN_FACE_HEIGHT = 0.12
MIN_SAMPLES = 8
MIN_FACE_SHARE = 0.6


def main():
    import mediapipe as mp

    request = json.load(sys.stdin)
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=request['model']),
        running_mode=mp.tasks.vision.RunningMode.IMAGE, num_faces=2)
    landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
    cap = cv2.VideoCapture(request['video'])
    fps = cap.get(cv2.CAP_PROP_FPS)
    wanted = {}
    for k, (start, end) in enumerate(request['spans']):
        t = start
        while t < end:
            wanted.setdefault(int(t * fps + 0.5), []).append(k)
            t += 1 / FPS
    samples = [[] for _ in request['spans']]
    i, last = 0, max(wanted, default=-1)
    try:
        while i <= last:
            if i in wanted:
                ok, frame = cap.read()
                if not ok:
                    break
                frame = cv2.resize(frame, (WIDTH, int(frame.shape[0] * WIDTH / frame.shape[1])))
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                result = landmarker.detect(image)
                value = None
                if result.face_landmarks:
                    face = max(result.face_landmarks, key=lambda p: abs(p[152].y - p[10].y))
                    height = abs(face[152].y - face[10].y)
                    if height > MIN_FACE_HEIGHT:
                        value = abs(face[14].y - face[13].y) / height
                for k in wanted[i]:
                    samples[k].append(value)
            elif not cap.grab():
                break
            i += 1
    finally:
        cap.release()
        landmarker.close()
    out = []
    for values in samples:
        seen = np.array([v for v in values if v is not None], float)
        if len(values) == 0 or len(seen) < MIN_FACE_SHARE * len(values) or len(seen) < MIN_SAMPLES:
            out.append(None)
        else:
            out.append(float(np.percentile(seen, 90) - np.percentile(seen, 10)))
    json.dump({'mouth': out}, sys.stdout)


if __name__ == '__main__':
    main()
