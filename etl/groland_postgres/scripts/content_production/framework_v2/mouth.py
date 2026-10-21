"""Per-shot mouth opening for framework v2 (business rule 2026-10-19: live footage is the person's own
speech or silent product use; dubbed clips of someone not speaking are mixed).

MediaPipe runs in its own interpreter (FRAMEWORK_V2_MOUTH_PYTHON) because it pins numpy<2 and
opencv-contrib; mouth_probe.py is the whole contract. The face landmarker model is SHA-256 pinned.
"""
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

PYTHON_ENV = 'FRAMEWORK_V2_MOUTH_PYTHON'
MODEL_ENV = 'FRAMEWORK_V2_MOUTH_MODEL'
MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
PROBE = Path(__file__).with_name('mouth_probe.py')
TIMEOUT_SECONDS = 600


def _config():
    python, model = os.getenv(PYTHON_ENV, ''), os.getenv(MODEL_ENV, '')
    if not python or not Path(python).is_file():
        raise RuntimeError(f'{PYTHON_ENV} must point to the MediaPipe interpreter')
    if not model or not Path(model).is_file():
        raise RuntimeError(f'{MODEL_ENV} must point to face_landmarker.task')
    return python, model


def check():
    """Node prerequisite: interpreter present and the pinned model in place."""
    _, model = _config()
    if hashlib.sha256(Path(model).read_bytes()).hexdigest() != MODEL_SHA256:
        raise RuntimeError('face_landmarker.task does not match the pinned SHA-256')
    return {'faceLandmarker': MODEL_SHA256}


def shot_mouth(video, spans, tick=lambda: None):
    """One p90-p10 inner-lip spread (or None) per span; tick keeps the job lease alive meanwhile."""
    python, model = _config()
    request = json.dumps({'video': str(video), 'model': model, 'spans': [[a, b] for a, b in spans]})
    proc = subprocess.Popen([python, '-I', str(PROBE)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)
    proc.stdin.write(request)
    proc.stdin.close()
    deadline = time.monotonic() + TIMEOUT_SECONDS
    while proc.poll() is None:
        if time.monotonic() > deadline:
            proc.kill()
            proc.wait()
            raise RuntimeError('mouth probe timed out')
        tick()
        time.sleep(0.5)
    out, err = proc.stdout.read(), proc.stderr.read()
    if proc.returncode != 0:
        raise RuntimeError(f'mouth probe failed: {err.strip().splitlines()[-1] if err.strip() else proc.returncode}')
    values = json.loads(out)['mouth']
    if len(values) != len(spans):
        raise RuntimeError('mouth probe returned the wrong number of shots')
    return values
