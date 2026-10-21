import unittest
from pathlib import Path
from unittest.mock import Mock
from types import SimpleNamespace
from content_production import framework_composition as c
from test_framework_composition import answer, isolated

class CompositionUncertainty(unittest.TestCase):
    def test_probability_near_boundary_requests_concrete_context(self):
        targets=[dict(index=1,start_ms=12000,end_ms=25000)]
        observed={'observations':[dict(index=0,role='independent_review',target_action='applies and compares',
            left_relation='earlier unit ends',right_relation='next unit starts',evidence='self contained demonstration')]}
        request=Mock(return_value=SimpleNamespace(payload=observed,usage={},response_id='id'))
        close=answer();close['probabilities']={'assembled_support':.7,'independent_review':.2,'own_review_step':.09,'uncertain':.01}
        decisions,_=c.clarify({'q0':close},targets,Path('video'),request)
        self.assertEqual(decisions,{0:'live_demo'});request.assert_called_once()

    def test_tied_probabilities_require_context_instead_of_rejection_before_repair(self):
        p={'independent_review':.4999,'own_review_step':0.,'assembled_support':.4999,'uncertain':.0002}
        answers={'q0':dict(type='choice',choice='independent_review',confidence=.49,probabilities=p)}
        self.assertEqual(c.labels(answers,1,allow_unresolved=True),[None])
        with self.assertRaisesRegex(ValueError,'Unresolved'):
            c.apply(isolated(),[dict(index=1,start_ms=10000,end_ms=24000)],answers,clarified={})
