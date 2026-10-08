"""Deterministic follow-up proposals from validated Worker observations.

These are read-only recommendations, not edits, retry grants or delivery approval.
"""


def propose_follow_up(report):
    proposals = []
    for index, entry in enumerate(report['entries']):
        window = entry['window']
        identity = {key: window[key] for key in ('clipId', 'startFrame', 'endFrame')}
        identity.update({key: window[key] for key in ('assetVersionId', 'sha256') if key in window})
        visual = {check['kind']: check for check in entry.get('checks', [])}
        def add(category, action, reason, evidence, requirement):
            proposals.append({'target': dict(identity), 'category': category, 'action': action,
                              'reason': reason, 'evidencePath': evidence, 'requirement': requirement})
        for kind, requirement in (
                ('picture_narration', 'match_current_narration_and_brief'),
                ('visible_artifacts', 'determine_source_or_render_defect')):
            check = visual.get(kind)
            verdict = check.get('verdict') if check else None
            path = f'/entries/{index}'
            if check:
                path += f"/checks/{entry['checks'].index(check)}"
            if verdict == 'issue_observed':
                add(kind, 'reselect_source' if kind == 'picture_narration' else 'compare_source_and_render',
                    check['observation'], path, requirement)
            elif verdict != 'no_issue_observed':
                add(kind, 'collect_evidence', check['observation'] if check else entry.get('reason', entry.get('errorStage', 'not_reviewed')),
                    path, requirement)
        text = entry.get('textReview', {})
        checks = text.get('checks', []) if text.get('status') == 'reviewed' else []
        check = next((check for check in checks if check['id'] == entry['clipId']), None)
        relation = check.get('relation') if check else None
        if relation == 'conflict':
            add('visible_text', 'reselect_source', check['reason'], f'/entries/{index}/textReview/checks/{checks.index(check)}',
                'original_text_compatible_with_narration_and_brief')
        elif relation != 'compatible':
            add('visible_text', 'collect_evidence', check['reason'] if check else text.get('reason', text.get('errorStage', 'not_reviewed')),
                f'/entries/{index}', 'obtain_readable_text_and_independent_comparison')
    needs_revision = any(p['action'] != 'collect_evidence' for p in proposals)
    return {'schema': 'aios.selected-review-follow-up.v1',
            'status': 'revision_proposed' if needs_revision else 'evidence_required' if proposals or not report['entries'] else 'observations_only',
            'binding': {key: report[key] for key in ('runId', 'jobId', 'documentSha256', 'outputSha256')},
            'proposals': proposals, 'execution': 'not_started', 'deliveryApproved': False,
            'constraints': {'preserveOriginalSubtitles': True, 'preserveOriginalAudio': True,
                            'automaticErasureAllowed': False, 'automaticCaptionRewriteAllowed': False},
            'unverified': ['full_video_quality', 'audio_visual_sync', 'product_identity']}
