"""Frozen renderer/font requirements; no downloads or implicit package upgrades."""
import argparse
import hashlib
import json
import re
from pathlib import Path


MEDIAKIT_ENGINE = 'mediakit/multi-track-edit'


class RenderBindingMismatch(RuntimeError):
    pass


def valid_binding(value) -> bool:
    if (not isinstance(value, dict) or set(value) != {'contractVersion', 'rendererLockSha256', 'engine', 'engineVersion', 'captionFont'}
            or type(value['contractVersion']) is not int or value['contractVersion'] != 1
            or value['engine'] != '@hyperframes/producer'):
        return False
    font = value['captionFont']
    if not isinstance(font, dict) or set(font) != {'profile', 'sha256'}:
        return False
    return all(isinstance(item, str) and re.fullmatch(pattern, item) for item, pattern in (
        (value['rendererLockSha256'], r'[a-f0-9]{64}'), (value['engineVersion'], r'[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}'),
        (font['sha256'], r'[a-f0-9]{64}'), (font['profile'], r'[a-z][a-z0-9-]{0,63}')))


def current_binding() -> dict:
    raw = Path(__file__).with_name('creative-craft.lock.json').read_bytes()
    lock = json.loads(raw)
    return {'contractVersion': 1, 'rendererLockSha256': hashlib.sha256(raw).hexdigest(),
            'engine': lock['engine'], 'engineVersion': lock['engine_version'],
            'captionFont': lock['caption_font']}


def require_binding(snapshot: dict, *, required: bool = False) -> dict | None:
    if 'renderBinding' not in snapshot:
        if required:
            raise RenderBindingMismatch('历史任务未冻结渲染包版本，请保留原任务并新建制作任务')
        return None  # Pre-binding manual projects retain explicit legacy behavior.
    binding = snapshot['renderBinding']
    if not valid_binding(binding) or binding != current_binding():
        raise RenderBindingMismatch('Worker渲染包或字幕字体与任务冻结版本不一致，请使用匹配版本后恢复任务')
    return binding


def attach_receipt(snapshot: dict, receipt: dict) -> None:
    binding = require_binding(snapshot)
    if binding is not None:
        if (receipt.get('engine') != binding['engine'] or receipt.get('engine_version') != binding['engineVersion']):
            raise RenderBindingMismatch('渲染回执的引擎与冻结版本不一致')
        receipt['render_binding'] = binding.copy()


def receipt_matches(snapshot: dict, receipt: dict) -> bool:
    # Check against the job's frozen requirement, not today's installation: a
    # previously rendered result must remain inspectable after package upgrades.
    if 'renderBinding' not in snapshot:
        return True
    if receipt.get('engine') == MEDIAKIT_ENGINE:
        # Cloud composition of caption-free clip snapshots uses neither the frozen
        # renderer package nor the caption font, so there is nothing to bind; the
        # receipt must not claim a render_binding it did not use.
        return (valid_binding(snapshot['renderBinding']) and 'render_binding' not in receipt
                and isinstance(receipt.get('mediakit'), dict) and snapshot.get('editDocument') is None
                and all(not str(clip.get('caption') or '').strip() for clip in snapshot.get('clips', [])))
    binding = snapshot['renderBinding']
    actual = receipt.get('render_binding')
    return valid_binding(binding) and valid_binding(actual) and actual == binding


def main():
    parser = argparse.ArgumentParser(description='Check or regenerate the API embedded render binding from the Worker lock')
    parser.add_argument('--write-api-binding', action='store_true')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    output = repo / 'backend-rust/src/marketing/content_assets/production/render-binding.json'
    data = json.dumps(current_binding(), ensure_ascii=False, indent=2) + '\n'
    if args.write_api_binding:
        output.write_text(data)
    elif not output.is_file() or output.read_text() != data:
        raise SystemExit('API render binding differs from Worker lock; regenerate it before building the API')
    print('API render binding matches Worker lock')


if __name__ == '__main__':
    main()
