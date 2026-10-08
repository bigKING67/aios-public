"""Bounded 32-second rinse-case fidelity check, not semantic or listening approval."""
from array import array
import json
import math
from pathlib import Path
import re
import subprocess
import sys


def main():
    output, manifest = map(Path, sys.argv[1:])
    document = json.loads((output / 'frozen-snapshot.json').read_text())['editDocument']
    sources = json.loads(manifest.read_text())
    paths = {asset['ref']: next(Path(row['path']) for row in sources if row['sha256'] == asset['sha256'])
             for asset in document['assets']}
    video = output / 'video.mp4'
    assert document['captions'] == [] and document['captionOverlayPolicy'] == 'preserve-source-picture-v1'
    tracks = {track['id']: track['kind'] for track in document['tracks']}
    audio_clips = [clip for clip in document['clips'] if tracks[clip['trackId']] == 'audio']
    assert len(audio_clips) == 1
    narration = paths[audio_clips[0]['assetRef']]
    def samples(path):
        data = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-t', '32', '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], check=True, capture_output=True).stdout
        result = array('h'); result.frombytes(data)
        return result
    x, y = samples(narration), samples(video)
    assert abs(len(x) - len(y)) <= 1 and min(len(x), len(y)) >= 255999
    correlation = sum(a*b for a, b in zip(x, y)) / math.sqrt(sum(a*a for a in x)*sum(b*b for b in y))
    assert correlation > .99
    # Predeclared expected sample: timeline 31.2 maps to replacement source 22.3.
    replacement = [clip for clip in document['clips'] if tracks[clip['trackId']] == 'video'][-1]
    segment = replacement['sourceMap'][0]
    assert replacement['timeline'] == {'startFrame': 927, 'endFrame': 960}
    assert segment['startFrame'] == 0 and segment['endFrame'] == 33
    assert segment['sourceStart']['num'] / segment['sourceStart']['den'] == 22
    for name, path, time in [('source', paths[replacement['assetRef']], '22.3'), ('output', video, '31.2')]:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(path), '-ss', time, '-frames:v', '1', '-vf', 'scale=720:1280', str(output / f'{name}.png')], check=True, capture_output=True)
    metrics = {}
    for label, crop in [('fullFrame', ''), ('lowerSubtitleRegion', 'crop=iw:ih*0.4:0:ih*0.6,')]:
        filters = f'[0:v]{crop}null[a];[1:v]{crop}null[b];[a][b]ssim'
        result = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(output / 'source.png'), '-i', str(output / 'output.png'), '-filter_complex', filters, '-f', 'null', '-'], check=True, capture_output=True)
        value = float(re.findall(r'All:([\d.]+)', result.stderr.decode())[-1])
        assert value > .95, (label, value)
        metrics[label] = value
    evidence = {'status': 'passed', 'scope': 'bounded audio and frame fidelity', 'audioCorrelation': correlation,
                'audioSamples': [len(x), len(y)], 'sampledSSIM': metrics,
                'newCaptions': 0, 'fullPlaybackVerified': False, 'listeningVerified': False, 'deliveryApproved': False}
    (output / 'fidelity.json').write_text(json.dumps(evidence, indent=2))
    print(json.dumps(evidence))


if __name__ == '__main__':
    main()
