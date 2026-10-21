"""Evaluation-only media tapes, keyed by logical command and input bytes.

Existing media can be certified by an offline archived-code reconstruction:
the complete request sequence and published prediction must reproduce before
its recipes become reusable. Never infer recipes merely from output filenames.
"""
import hashlib
import json
from pathlib import Path
import shutil
import threading


class MediaTape:
    def __init__(self, output, run_media, roots=(), *, reconstruct_from=None):
        self.output = Path(output).resolve()
        self.original = run_media
        self.reconstruct_from = Path(reconstruct_from).resolve() if reconstruct_from else None
        self.cache, self.records, self.hashes = {}, {}, {}
        self.lock = threading.RLock()
        for root in roots:
            manifest = json.loads((Path(root)/'media-tape.json').read_text())
            if not manifest.get('certified'):
                raise ValueError('Uncertified evaluation media tape')
            for key, value in manifest['recipes'].items():
                self.cache.setdefault(key, value)

    def sha(self, path):
        path = Path(path).resolve()
        stat = path.stat()
        key = (str(path), stat.st_mtime_ns, stat.st_size)
        with self.lock:
            if key not in self.hashes:
                h = hashlib.sha256()
                with path.open('rb') as stream:
                    for chunk in iter(lambda: stream.read(1024*1024), b''):
                        h.update(chunk)
                self.hashes[key] = h.hexdigest()
            return self.hashes[key]

    def recipe(self, command, stderr):
        args = list(map(str, command))
        # Binding to binary bytes invalidates tapes after an FFmpeg upgrade.
        binary = shutil.which(args[0]) or args[0]
        args[0] = dict(binary_sha256=self.sha(binary))
        for i in range(1, len(args)-1):
            if args[i-1] == '-i':
                args[i] = dict(input_sha256=self.sha(args[i]))
        target = None if args[-1] == '-' else Path(args[-1]).parent.resolve()/Path(args[-1]).name
        if target is not None and not target.is_relative_to(self.output):
            raise ValueError('Media output escapes evaluation directory')
        args[-1] = dict(output_suffix=target.suffix) if target else '-'
        log = Path(stderr.name).parent.resolve()/Path(stderr.name).name if hasattr(stderr, 'name') else None
        if log is not None and not log.is_relative_to(self.output):
            raise ValueError('Media log escapes evaluation directory')
        key = hashlib.sha256(json.dumps(dict(command=args, captures_stderr=log is not None),
                                         sort_keys=True).encode()).hexdigest()
        return key, target, log

    def restore(self, value, target, stderr):
        for name, destination in (('output', target), ('stderr', stderr if hasattr(stderr, 'write') else None)):
            saved = value.get(name)
            if saved is None:
                if destination is not None:
                    raise ValueError('Media tape missing required output')
                continue
            source = Path(saved['path'])
            if self.sha(source) != saved['sha256']:
                raise ValueError('Evaluation media changed after certification')
            if name == 'stderr':
                destination.write(source.read_bytes())
                destination.flush()
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.unlink(missing_ok=True)
                # Consumers only read these outputs. Every subsequent command
                # unlinks its destination before executing, protecting originals.
                destination.symlink_to(source)

    def run(self, command, env, tick, timeout, stderr=-3, poll_seconds=1.0):
        tick()
        key, target, log = self.recipe(command, stderr)
        value = self.cache.get(key)
        if value is not None:
            self.restore(value, target, stderr)
            reused = True
        elif self.reconstruct_from is not None and target is not None:
            source = self.reconstruct_from/target.relative_to(self.output)
            if not source.is_file() or log is not None:
                raise ValueError('Historical media unavailable for reconstruction')
            value = dict(output=dict(path=str(source.resolve()), sha256=self.sha(source)))
            self.restore(value, target, stderr)
            reused = True
        else:
            if target is not None and target.is_symlink():
                target.unlink()
            code = self.original(command, env, tick, timeout, stderr=stderr, poll_seconds=poll_seconds)
            if code:
                return code
            value = {}
            if target is not None:
                value['output'] = dict(path=str(target.resolve()), sha256=self.sha(target))
            if log is not None:
                stderr.flush()
                saved = self.output/'media-logs'/f'{key}.log'
                saved.parent.mkdir(exist_ok=True)
                shutil.copy2(log, saved)
                value['stderr'] = dict(path=str(saved), sha256=self.sha(saved))
            reused = False
        with self.lock:
            self.records[key] = dict(value, reused=reused)
        return 0

    def save(self, *, certified, provenance):
        data = dict(schema='framework-media-tape-v1', certified=certified,
                    provenance=provenance, recipes=self.records,
                    limitation='Frozen media replay validates classifier changes; not a fresh encoder benchmark.')
        (self.output/'media-tape.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))
        return data
