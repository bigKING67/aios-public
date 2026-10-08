from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Callable
from .output_profile import canvas
from .render_binding import require_binding, attach_receipt


class Cancelled(RuntimeError):
    pass


def verify_module(root: Path) -> None:
    lock = json.loads(Path(__file__).with_name("creative-craft.lock.json").read_text())
    for name, expected in lock["files"].items():
        file = root / name
        if file.is_symlink() or not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise RuntimeError(f"Creative Craft 内容锁不匹配: {name}")
    installed = root / "node_modules/@hyperframes/producer/package.json"
    if not installed.is_file() or json.loads(installed.read_text())["version"] != lock["engine_version"]:
        raise RuntimeError("Creative Craft 渲染依赖缺失或版本不匹配")


def file_hash(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_spec(snapshot: dict, media: dict[str, Path], project_id: str) -> dict:
    assets = [{"id": "a" + str(a["assetId"]).replace("-", ""), "path": str(media[a["assetId"]])} for a in snapshot["assets"]]
    clips = []
    for index, clip in enumerate(snapshot["clips"]):
        start, end = clip["startMs"] / 1000, clip["endMs"] / 1000
        # Floor to the output frame grid so no frame consumes beyond the source out point.
        frames = int((clip["endMs"] - clip["startMs"]) * 30 // 1000)
        if frames < 1:
            raise ValueError("片段短于一帧")
        clips.append({"id": f"clip{index}", "asset_id": "a" + clip["assetId"].replace("-", ""),
                      "in_seconds": start, "frames": frames, "volume": clip["volume"], "fit": "contain",
                      "captions": [{"from": start, "to": end, "text": clip["caption"]}] if clip["caption"].strip() else []})
    return {"project_id": "p" + project_id.replace("-", ""), "title": snapshot["title"],
            "canvas": canvas(snapshot), "assets": assets, "clips": clips, "audio": []}


def renderer_env(home: Path) -> dict[str, str]:
    env = {name: os.environ[name] for name in ("PATH", "LANG", "LC_ALL", "PRODUCER_HEADLESS_SHELL_PATH") if name in os.environ}
    env.update({"HOME": str(home), "TMPDIR": str(home), "PUPPETEER_SKIP_DOWNLOAD": "true"})
    return env


def render_timeout_seconds() -> int:
    """Chromium renderer budget; long renders on the shared VPS can exceed the historic 30 minutes."""
    raw = os.getenv("CONTENT_PRODUCTION_RENDER_TIMEOUT_SECONDS", "").strip()
    value = int(raw) if raw else 1800
    if not 300 <= value <= 7200:
        raise ValueError("CONTENT_PRODUCTION_RENDER_TIMEOUT_SECONDS must be within 300..7200")
    return value


def run_cli(root: Path, arguments: list[str], work: Path, tick: Callable[[], None], timeout: int | None = None,
            lock_fd: int | None = None) -> None:
    timeout = timeout or render_timeout_seconds()
    tick()
    # Evidence/output stays in work; engine frame caches belong to this invocation.
    with tempfile.TemporaryDirectory(prefix=".aios-render-tmp-", dir=work.resolve()) as scratch, \
            (work / "renderer.log").open("ab") as log:
        env = {**renderer_env(work), "TMPDIR": scratch}
        proc = subprocess.Popen([os.getenv("CONTENT_PRODUCTION_NODE", "node"), str(root / "cli.mjs"), *arguments],
                                cwd=root, env=env, stdout=log, stderr=log, start_new_session=True,
                                pass_fds=() if lock_fd is None else (lock_fd,))
        start = time.monotonic()
        try:
            while proc.poll() is None:
                if time.monotonic() - start > timeout:
                    raise TimeoutError("视频制作超时")
                tick()
                time.sleep(1)
            if proc.returncode:
                raise RuntimeError("制作引擎执行失败")
            tick()
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait(timeout=10)
            # A finished CLI can leave browser/ffmpeg children in its owned group.
            # Stop those before the private temporary directory is reclaimed.
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def render_local(root: Path, snapshot: dict, media: dict[str, Path], project_id: str,
                 work: Path, preview: bool, tick: Callable[[], None], lock_fd: int | None = None) -> tuple[Path, dict]:
    verify_module(root)
    require_binding(snapshot)
    spec = build_spec(snapshot, media, project_id)
    video, receipt = render_spec(root, spec, work, preview, tick, lock_fd)
    attach_receipt(snapshot, receipt)
    return video, receipt


def render_spec(root: Path, spec: dict, work: Path, preview: bool, tick: Callable[[], None],
                lock_fd: int | None = None) -> tuple[Path, dict]:
    """Execute a host-compiled spec after the caller verifies the module lock."""
    spec_file = work / "spec.json"
    spec_file.write_text(json.dumps(spec, ensure_ascii=False))
    project, output = work / "project", work / "render"
    run_cli(root, ["create", str(project), str(spec_file)], work, tick, lock_fd=lock_fd)
    run_cli(root, ["preview" if preview else "render", str(project), str(output), "1"], work, tick, lock_fd=lock_fd)
    receipt = json.loads((output / "receipt.json").read_text())
    video = output / "video.mp4"
    if receipt.get("status") != "completed" or not video.is_file() or file_hash(video) != receipt.get("output", {}).get("sha256"):
        raise RuntimeError("渲染回执与产物不一致")
    verify_caption_font_receipt(root, spec, output, receipt)
    return video, receipt


def verify_caption_font_receipt(root: Path, spec: dict, output: Path, receipt: dict) -> None:
    """New captioned renders must use the bundled bytes, never host fallback."""
    active = any(cue["to"] > clip["in_seconds"] and
                 cue["from"] < clip["in_seconds"] + clip["frames"] / spec["canvas"]["fps"]
                 for clip in spec["clips"] for cue in clip["captions"])
    if not active:
        return
    manifest = json.loads((root / "fonts/manifest.json").read_text())
    expected = {"profile": manifest["profile"], "sha256": manifest["sha256"],
                "file": f'fonts/{manifest["sha256"]}.ttf', "integrity": "passed",
                "glyph_coverage": "passed", "runtime_load": "passed", "source_match": "unverified"}
    font = output / expected["file"]
    if (receipt.get("caption_font") != expected or font.parent.is_symlink() or font.is_symlink()
            or not font.is_file() or file_hash(font) != expected["sha256"]):
        raise RuntimeError("字幕字体回执或制品不一致")
