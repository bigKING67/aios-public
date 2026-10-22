"""Research-only source-review recall; a route never establishes membership."""
from ..framework_v2 import rules
from .source_review import sample_times

VERSION = 'source-routes-v2-own-detail-pairs'


def continuity_candidates(shots):
    """Queue adjacent own/detail pairs before duration or LIVE classification.

    ``own`` is only a role candidate. Close-ups/products may be a presenter's
    own demonstration or an external insert, even with the same person chain.
    Neither face count, an operation flag, price text nor a returning presenter
    establishes that relation. Inspect both edges of multi-shot details too.

    These are two-interval tasks, NOT inputs for the historical three-interval
    source_review protocol. Callers retain source/input identities and all
    pending records, and validate facts before any later relation probe. No
    sampling, relation inference, new cut or classification is performed here.
    """
    result = []
    for i, (before, after) in enumerate(zip(shots, shots[1:])):
        if before.get('kind') != 'own' or after.get('kind') != 'own':
            continue
        subjects = [(shot.get('facts') or {}).get('subject') for shot in (before, after)]
        if not any(subject in ('closeup', 'product') for subject in subjects):
            continue
        # Do not join separated safe-sampling windows or rounded nearby cuts.
        # Reuse the caller's original boundary; precision is not fabricated.
        if before['end'] != after['start']:
            continue
        result.append(dict(shotIndices=[i, i+1],
            intervals=[[shot['start'], shot['end']] for shot in (before, after)],
            reason='own_detail_source_unverified', reviewStatus='unprobed',
            sourceRelation='uncertain', candidateBoundaries=[],
            classificationAction='none', automaticAdoption=False))
    return result


def candidates(segments, shots):
    """Historical ad-triplet route, kept stable for exact negative replay.

    A shared chain can contain a false join, so it cannot exempt an ad-tagged
    intervening shot from inspection. This is a recall-oriented route only:
    legitimate own product close-ups are expected candidates too.
    """
    result = []
    for i in range(1, len(shots)-1):
        before, middle, after = shots[i-1:i+2]
        chain = before.get('chain')
        if (chain is None or after.get('chain') != chain or middle.get('kind') != 'ad' or
                before.get('kind') != 'own' or after.get('kind') != 'own'):
            continue
        if not any(label == rules.LIVE and a <= before['start']+.002 and b >= after['end']-.002
                   for a, b, label in segments):
            continue
        intervals = [[s['start'], s['end']] for s in (before, middle, after)]
        if any(abs(x[1]-y[0]) > .002 for x, y in zip(intervals, intervals[1:])):
            continue
        result.append(dict(shotIndices=[i-1, i, i+1], intervals=intervals, times=sample_times(intervals),
                           reason='joined_chain_across_ad_tag', automaticAdoption=False))
    return result
