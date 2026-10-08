"""Deterministic derivation from frozen host ASR, shared by render and delivery checks."""
import copy
import math
from fractions import Fraction


def derive_caption_document(document):
    from .caption_revision import revise_captions
    from .caption_quality import document_digest
    repair=document['captionRepair']
    required={'policy','transcriptId','clipId','assetVersionId','sourceSha256','result'}
    if not isinstance(repair,dict) or set(repair)!=required or repair['policy']!='asr-boundary-repair-v1':
        raise ValueError('unsupported frozen caption repair')
    import uuid
    uuid.UUID(repair['transcriptId'])
    derived=copy.deepcopy(document);del derived['captionRepair']
    clips=[c for c in derived['clips'] if c['id']==repair['clipId']]
    if len(clips)!=1:raise ValueError('caption repair source clip missing')
    clip=clips[0]
    assets=[a for a in derived['assets'] if a['ref']==clip['assetRef']]
    if len(assets)!=1 or assets[0]['assetVersionId']!=repair['assetVersionId'] or assets[0]['sha256']!=repair['sourceSha256']:
        raise ValueError('caption repair source changed')
    mapping=clip['sourceMap'][0]
    def ms(key):
        t=mapping[key];return Fraction(t['num']*1000,t['den'])
    def no_model(_):raise RuntimeError('frozen caption repair must not call a model')
    plan=revise_captions(repair['result'],{'captions':derived['captions']},call_model=no_model,
        model='not-called',clip_id=clip['id'],asset_version_id=repair['assetVersionId'],
        source_start_ms=math.ceil(ms('sourceStart')),source_end_ms=math.floor(ms('sourceEnd')),
        max_calls=0,output_mode='boundaries',display_document=derived)
    derived['captions']=plan['captions']
    receipt={'policy':repair['policy'],'transcriptId':repair['transcriptId'],
        'sourceDocumentSha256':document_digest(document),'effectiveDocumentSha256':document_digest(derived),
        'revision':plan['revision'],'warnings':plan['warnings'],'captions':plan['captions']}
    return derived,receipt
