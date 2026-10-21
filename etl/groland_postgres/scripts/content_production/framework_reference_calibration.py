"""Build an evaluation-only reference from reviewed cuts and owner decisions.

Original business timelines stay immutable. Each temporal change must retain
an independent millisecond source guard and its bound review evidence.
"""
import copy
import math
import re

POLICY = 'source-calibrated-v1'


def _number(value):
    return type(value) in (int,float) and math.isfinite(value)


def _digest(value):
    return isinstance(value,str) and re.fullmatch('[0-9a-f]{64}',value) is not None


def calibrated_corpus(corpus, overlay):
    policy=corpus['acceptancePolicy']
    if (not isinstance(policy,dict) or policy.get('id')!=POLICY
            or not isinstance(policy.get('basis'),str) or not policy['basis'].strip()
            or not isinstance(policy.get('sourceBoundaryCorrections'),list)
            or not policy['sourceBoundaryCorrections']):
        raise ValueError('Invalid source calibration policy')
    guards={c['id']:c for c in corpus.get('regressionCases',[])}
    if len(guards)!=len(corpus.get('regressionCases',[])):
        raise ValueError('Duplicate calibration guard identifiers')
    calibrated=copy.deepcopy(corpus)
    del calibrated['acceptancePolicy']
    applied=[];seen=set()
    for correction in policy['sourceBoundaryCorrections']:
        if not isinstance(correction,dict):
            raise ValueError('Invalid source correction')
        guard=guards.get(correction.get('guardId'))
        film=correction.get('film');entry=corpus['films'].get(film)
        old=correction.get('originalBoundarySeconds')
        if (not guard or not entry or guard['id'] in seen or guard['film']!=film
                or not _digest(correction.get('sourceSha256'))
                or correction['sourceSha256']!=entry['sourceSha256'] or not _number(old)):
            raise ValueError('Missing, duplicated or stale source calibration')
        seen.add(guard['id'])
        cut=guard.get('source_boundary');pts=guard.get('source_frame_pts')
        if (not _number(cut) or cut==old or not isinstance(pts,list) or len(pts)!=2
                or not all(_number(p) for p in pts) or not pts[0]<pts[1]
                or pts[0]>=cut or abs(pts[1]-cut)>.001
                or not _digest(guard.get('source_evidence_sha256'))
                or not _digest(guard.get('context_evidence_sha256'))
                or guard.get('source_before_label')==guard.get('source_after_label')
                or abs(guard['start']-min(old,cut))>1e-6 or abs(guard['end']-max(old,cut))>1e-6
                or guard['label']!=guard.get('source_after_label' if cut<old else 'source_before_label')):
            raise ValueError('Unproven source calibration interval')
        timeline=calibrated['films'][film]['segments']
        pairs=[i for i,(left,right) in enumerate(zip(timeline,timeline[1:]))
               if abs(left[1]-old)<1e-6 and abs(right[0]-old)<1e-6
               and left[2]==guard['source_before_label'] and right[2]==guard['source_after_label']]
        if len(pairs)!=1:
            raise ValueError('Source calibration does not match the original transition')
        index=pairs[0];left,right=timeline[index:index+2]
        if not left[0]<cut<right[1]:
            raise ValueError('Source calibration crosses another content unit')
        left[1]=cut;right[0]=cut
        applied.append(dict(correction,sourceBoundarySeconds=cut,
            before=guard['source_before_label'],after=guard['source_after_label'],
            sourceEvidenceSha256=guard['source_evidence_sha256'],
            contextEvidenceSha256=guard['context_evidence_sha256']))
    for film,entry in calibrated['films'].items():
        entry['segments']=overlay(entry['segments'],[c for c in corpus['assertions'] if c['film']==film])
    for correction in applied:
        guard=guards[correction['guardId']]
        timeline=calibrated['films'][correction['film']]['segments']
        if not any(abs(left[1]-guard['source_boundary'])<1e-6
                   and abs(right[0]-guard['source_boundary'])<1e-6
                   and left[2]==guard['source_before_label'] and right[2]==guard['source_after_label']
                   for left,right in zip(timeline,timeline[1:])):
            raise ValueError('Owner adjudication conflicts with a calibrated source transition')
    return calibrated,dict(id=POLICY,basis=policy['basis'],evaluationOnly=True,
        sourceCorrectionCount=len(applied),boundaryCorrections=applied,
        ownerAdjudicationIds=[c['id'] for c in corpus['assertions']],
        acceptanceScope='historical_regression',
        note='Original diagnostics retained separately; no inference, tolerance, guard or baseline changes. '
             'Historical acceptance does not establish fresh-model stability or unseen accuracy.')
