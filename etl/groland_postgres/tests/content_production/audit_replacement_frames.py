"""Inspect every frame of the saved 1.1s rinse replacement; no semantic approval."""
import json
import hashlib
from pathlib import Path
import re
import subprocess
import sys


def main():
    output, manifest = map(Path, sys.argv[1:])
    snapshot = json.loads((output / 'frozen-snapshot.json').read_text())
    doc = snapshot['editDocument']
    tracks = {t['id']: t['kind'] for t in doc['tracks']}
    clip = [c for c in doc['clips'] if tracks[c['trackId']] == 'video'][-1]
    assert clip['timeline'] == {'startFrame': 927, 'endFrame': 960}
    segment = clip['sourceMap'][0]
    assert segment['sourceStart']['num'] / segment['sourceStart']['den'] == 22
    assert segment['sourceEnd']['num'] / segment['sourceEnd']['den'] == 23.1
    asset = next(a for a in doc['assets'] if a['ref'] == clip['assetRef'])
    source = next(Path(r['path']) for r in json.loads(manifest.read_text()) if r['sha256'] == asset['sha256'])
    assert hashlib.sha256(source.read_bytes()).hexdigest() == asset['sha256']
    receipt = json.loads((output / 'receipt.json').read_text())
    assert hashlib.sha256((output / 'video.mp4').read_bytes()).hexdigest() == receipt['job']['receipt']['host_inspection']['sha256']
    audit = output / 'selected-frame-audit'
    audit.mkdir(exist_ok=True)
    video = (output / 'video.mp4').resolve()
    metrics = {}
    for name, crop in [('full', 'null'), ('subtitle_band', 'crop=iw:ih*0.4:0:ih*0.6')]:
        graph = (f'[0:v]trim=start=22:end=23.1,setpts=PTS-STARTPTS,fps=30,scale=720:1280,{crop}[a];'
                 f'[1:v]trim=start_frame=927:end_frame=960,setpts=PTS-STARTPTS,{crop}[b];'
                 f'[a][b]ssim=stats_file={name}.txt')
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source.resolve()), '-i', str(video),
                        '-filter_complex', graph, '-frames:v', '33', '-f', 'null', '-'], cwd=audit, check=True, capture_output=True)
        scores = [float(v) for v in re.findall(r'All:([\d.]+)', (audit / f'{name}.txt').read_text())]
        assert len(scores) == 33, (name, len(scores))
        metrics[name] = {'frames': len(scores), 'minimum': min(scores), 'mean': sum(scores)/len(scores),
                         'below095': [i for i, v in enumerate(scores) if v < .95]}
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-vf',
                    'trim=start_frame=927:end_frame=960,setpts=PTS-STARTPTS,scale=360:640',
                    '-frames:v', '33', str((audit / 'frame-%02d.png').resolve())], check=True, capture_output=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-i',
                    str((audit / 'frame-%02d.png').resolve()), '-vf', 'tile=6x6',
                    '-frames:v', '1', '-q:v', '2', str((audit / 'contact-sheet.jpg').resolve())],
                   check=True, capture_output=True)
    report = {'scope': 'all 33 selected replacement frames, source-output fidelity', 'metrics': metrics,
              'frameFidelityPassed': all(v['minimum'] >= .95 for v in metrics.values()),
              'semanticApproved': False, 'listeningVerified': False, 'deliveryApproved': False}
    (audit / 'report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
    assert report['frameFidelityPassed'], 'inspect the retained frame metrics; do not auto-approve'


if __name__ == '__main__':
    main()
