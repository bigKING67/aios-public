"""Experiment identities, immutable input copies and a crash-conservative call ledger."""
import fcntl
import importlib.metadata
import json
import os
import shutil
from pathlib import Path

from ..execution import file_hash
from ..framework_eval_runtime import digest


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def code_files():
    root = Path(__file__).resolve().parents[2]
    return {str(p.relative_to(root)): p for name in ('content_production', 'marketing_content_assets')
            for p in sorted((root/name).rglob('*.py'))}


def code_identity():
    return {name: file_hash(path) for name, path in code_files().items()}


def kernel_identity(identities):
    # Harness tooling may evolve without re-running unchanged, billed observations.
    # Every experiment still freezes its own Harness code; classifier and scorer
    # code must match the observation capture exactly. Native sampling determines
    # the model's inputs, so it is part of the kernel even though it is opt-in.
    sampling_files = ('/framework_harness/source_sampling.py', '/framework_harness/source_pipeline.py',
                      '/framework_harness/transition_sampling.py')
    return {name: sha for name, sha in identities.items()
            if '/framework_harness/' not in name or name.endswith(sampling_files)}


def snapshot(output):
    identities = code_identity()
    for name, source in code_files().items():
        target = output/'code'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    versions = {}
    for name in ('gepa', 'numpy', 'opencv-python-headless', 'torch', 'rapidocr', 'scenedetect'):
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = None
    return dict(code=identities, packages=versions)


class BudgetExhausted(RuntimeError):
    pass


class Ledger:
    """Reserve before network I/O; a crash/timeout remains charged, including reflection.

    The same file and cap must be used by every process in one experiment. Reopening
    never resets the count. No credentials, request bodies or exception text are saved.
    """
    def __init__(self, path, maximum):
        if type(maximum) is not int or not 0 <= maximum <= 10000:
            raise ValueError('Invalid explicit call budget')
        self.path, self.maximum = Path(path), maximum
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def reserve(self, kind, request_hash):
        with self.path.open('a+') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            stream.seek(0)
            raw = stream.read()
            data = json.loads(raw) if raw else dict(maximum=self.maximum, calls=[])
            if data['maximum'] != self.maximum:
                raise ValueError('An experiment budget cannot be changed on reopen')
            if len(data['calls']) >= self.maximum:
                raise BudgetExhausted('Shared cloud-call budget exhausted')
            data['calls'].append(dict(kind=kind, requestHash=request_hash))
            stream.seek(0)
            stream.truncate()
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
            return len(data['calls'])


def candidate(value):
    """Only an observation guide is mutable. It is never executed or formatted as code."""
    if (not isinstance(value, dict) or set(value) != {'review_guidance'} or
            not isinstance(value['review_guidance'], str) or len(value['review_guidance']) > 2000):
        raise ValueError('Candidate must contain only review_guidance (at most 2000 characters)')
    return dict(value)


BASELINE = {'review_guidance': ''}


def prompt_for(value, duration):
    from ..framework_v2.review import PROMPT
    text = candidate(value)['review_guidance'].strip()
    # Empty seed is byte-for-byte the current production prompt.
    return PROMPT.format(dur=duration) + (('\n\n观察步骤建议（不得修改以上业务定义）：\n' + text) if text else '')


def validate_split(corpus, train, validation):
    groups = [train, validation]
    for group in groups:
        if not group or len(set(group)) != len(group) or not set(group) <= set(corpus['films']):
            raise ValueError('Invalid training/validation scope')
    def identities(group):
        return {corpus['films'][f]['sourceSha256'] for f in group}
    if set(train) & set(validation) or identities(train) & identities(validation):
        raise ValueError('Training and validation must have disjoint source identities')
    source_groups = [{corpus['films'][f].get('sourceGroup', corpus['films'][f]['sourceSha256']) for f in group}
                     for group in groups]
    if source_groups[0] & source_groups[1]:
        raise ValueError('Clips from the same source group cannot cross training/validation')
