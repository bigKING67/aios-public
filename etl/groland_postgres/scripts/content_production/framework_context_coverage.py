"""Use already measured context for short proposal gaps without pooling time."""


def qualified_core_prefixes(patches, windows):
    """Restore a qualified witness clipped by a processing seam, not a cut.

    One window must independently measure the complete qualified witness.
    All windows owning the omitted prefix must agree that it starts at the
    same physical review onset and contains one uninterrupted local unit.
    A separate ownership repair is not required: the seam itself can damage
    an already verified review. No durations are pooled.
    """
    restored = []
    for patch in patches:
        a,b = patch['witness']
        edge = patch['start_ms']
        if (patch['label_key'] != 'live_demo' or not a < edge
                or b-a < patch['minimum'] or patch['end_ms']-edge >= patch['minimum']):
            continue
        if not any(w['core_start'] == edge and w['core_end'] >= patch['end_ms']
                   and any(r['start_ms'] == a and r['end_ms'] == b and r['qualifies']
                           and not r.get('clipped') for r in w.get('measured', {}).get('runs', []))
                   for w in windows):
            continue
        owners = [w for w in windows if w['core_start'] < edge and w['core_end'] > a]
        if not owners:
            continue
        agrees = True
        for w in owners:
            inside = [e for e in w['events'] if min(edge,e['end_ms']) > max(a,e['start_ms'])]
            agrees &= bool(inside and inside[0]['start_ms'] == a and inside[-1]['end_ms'] >= edge
                and len({e['unit'] for e in inside}) == 1 and inside[0]['unit']
                and all(e['kind'] in ('presenter','own_detail') and not e.get('needs_ownership') for e in inside)
                and all(x['end_ms'] == y['start_ms'] for x,y in zip(inside,inside[1:])))
        if agrees:
            restored.append(dict(patch,start_ms=a,end_ms=edge,
                reason='原片已独立核实的完整测评跨窗口起点恢复'))
    return restored


def fill(segments, planned, receipts):
    patches = []
    cores = [(w['core_start'], w['core_end']) for w in planned]
    # Only previously unowned short montage proposals qualify. Long blocks and
    # each owned core retain their own observation authority.
    for segment in segments:
        a,b = segment['start_ms'],segment['end_ms']
        if segment['label_key'] != 'mixed_voiceover' or b-a >= 9000:
            continue
        edges = {a,b}
        for w in receipts:
            for r in w['measured']['runs']:
                edges.update(t for t in (r['start_ms'],r['end_ms']) if a<t<b)
        for start,end in zip(sorted(edges),sorted(edges)[1:]):
            if any(min(end,y)>max(start,x) for x,y in cores):
                continue
            covering = []
            for w in receipts:
                if w['start']<=start and w['end']>=end:
                    run = next((r for r in w['measured']['runs']
                        if r['start_ms']<=start and r['end_ms']>=end),None)
                    covering.append(run)
            if not covering or any(r is None or not r['qualifies'] for r in covering):
                continue
            # A single independent measurement must establish the duration;
            # never add partial lengths across windows or source inserts.
            witness = min(covering,key=lambda r:r['end_ms']-r['start_ms'])
            patches.append(dict(start_ms=start,end_ms=end,label_key='live_demo',confidence=.9,
                reason='已核验连续测评覆盖初始提案的短缺口',same_person=False,
                witness=(witness['start_ms'],witness['end_ms']),
                minimum=9000 if witness['tolerance'] else 10001))
    return patches
