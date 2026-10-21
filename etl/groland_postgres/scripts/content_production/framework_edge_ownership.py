"""Resolve an operation beside a real barrier, without inventing a second host."""


def repair(events, observe, verified_edges):
    result = [dict(e) for e in events]

    def anchor(index, step):
        for j in range(index+step, len(result) if step > 0 else -1, step):
            if result[j]['kind'] == 'presenter':
                return j
            if result[j]['kind'] != 'own_detail':
                break
        return None

    for i, event in enumerate(result):
        if event['kind'] != 'own_detail' or not event.get('needs_ownership'):
            continue
        left, right = anchor(i, -1), anchor(i, 1)
        if (left is None) == (right is None):
            continue
        j = right if left is None else left
        host = result[j]
        a, b = host['start_ms'], host['end_ms']
        target = (event['start_ms']+event['end_ms'])//2
        host_times = [a+(b-a)//3, a+2*(b-a)//3]
        times = [target,*host_times] if left is None else [*host_times,target]
        proof = observe(times)
        kinds = proof.get('kinds', [])
        if len(kinds) != 3:
            raise ValueError('Invalid one-sided operation evidence')
        kind = kinds[0 if left is None else 2]
        relationship = proof.get('left_to_middle' if left is None else 'middle_to_right')
        if relationship in ('different_person','separate_recording','independent_insert'):
            event.update(kind='independent_insert', unit='', needs_ownership=False,
                         ownership_basis='source_video_separate_edge')
        elif relationship in ('same_review','own_detail') and kind in ('presenter','own_detail'):
            if any(k not in ('presenter','own_detail') for k in kinds):
                raise ValueError('One-sided operation role contradicts its continuity')
            event.update(unit=host['unit'], needs_ownership=False,
                         ownership_basis='source_video_owned_edge')
            if abs(j-i) == 1:
                verified_edges.add(max(event['start_ms'],host['start_ms']))
        else:
            raise ValueError('Unresolved one-sided operation ownership')
    return result
