import copy
import unittest

from content_production import framework_offer_intro as module


def fixture():
    original = [dict(start_ms=0, end_ms=10000, label_key='mixed_voiceover', reason='original'),
                dict(start_ms=10000, end_ms=25000, label_key='promotion', reason='original')]
    classified = [dict(s, label_key='promotion') for s in original]
    payload = dict(items=[dict(index=0, role='dependent_offer_content', linked_index=1),
                          dict(index=1, role='independent_offer', linked_index=-1)])
    windows = [dict(start=0, end=25000, events=[dict(start_ms=0, end_ms=4000, kind='presenter', person='P1'),
                dict(start_ms=4000, end_ms=10000, kind='presenter', person='P2')])]
    return original, classified, payload, windows


def evidence(target, relationship):
    return dict(target, payload=dict(a_content='几段不同素材各自催买', b_content='本次活动规则',
        link_evidence='前面的泛化催买没有承接后面当次规则', relationship=relationship))


class OfferIntroductionTests(unittest.TestCase):
    def test_requires_adjacent_link_and_multiple_sources_in_one_namespace(self):
        original, _, payload, windows = fixture()
        self.assertEqual(len(module.plan(original, payload, windows)), 1)
        windows[0]['events'][1]['person'] = 'P1'
        self.assertEqual(module.plan(original, payload, windows), [])
        windows[0]['events'][1]['person'] = 'P2'
        windows[0]['end'] = 9000
        self.assertEqual(module.plan(original, payload, windows), [])

    def test_price_card_and_other_roles_are_not_automatically_reopened(self):
        original, _, payload, windows = fixture()
        for role in ('independent_offer', 'own_review', 'recommendation_material'):
            p = copy.deepcopy(payload);p['items'][0]['role'] = role
            self.assertEqual(module.plan(original, p, windows), [])
        for e in windows[0]['events']: e.update(kind='independent_insert', person='')
        self.assertEqual(module.plan(original, payload, windows), [])

    def test_separate_recommendation_restores_only_intro_and_keeps_boundaries(self):
        original, classified, payload, windows = fixture()
        targets = module.plan(original, payload, windows)
        result, corrections = module.apply(classified, targets, [evidence(targets[0], 'separate_recommendation')])
        self.assertEqual(result[0]['label_key'], 'mixed_voiceover')
        self.assertEqual(result[1], classified[1])
        self.assertEqual([(x['start_ms'], x['end_ms']) for x in result], [(0,10000),(10000,25000)])
        self.assertEqual(len(corrections), 1)
        self.assertEqual(classified[0]['label_key'], 'promotion')

    def test_multiple_sources_can_still_be_one_offer(self):
        original, classified, payload, windows = fixture()
        targets = module.plan(original, payload, windows)
        result, corrections = module.apply(classified, targets, [evidence(targets[0], 'same_offer_introduction')])
        self.assertEqual(result, classified)
        self.assertEqual(corrections, [])

    def test_unknown_missing_misbound_or_stale_evidence_rejects(self):
        original, classified, payload, windows = fixture()
        targets = module.plan(original, payload, windows)
        for change in ('unknown', 'missing', 'misbound', 'stale'):
            proof = evidence(targets[0], 'separate_recommendation');s = copy.deepcopy(classified)
            if change == 'unknown': proof['payload']['relationship'] = 'uncertain'
            if change == 'misbound': proof['split_ms'] += 1
            if change == 'stale': s[0]['end_ms'] += 1
            with self.assertRaises(ValueError):
                module.apply(s, targets, [] if change == 'missing' else [proof])
