import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from content_production import framework_detail_source as detail
from content_production.segment_suggestion_provider import ProviderResult


class DetailSource(unittest.TestCase):
    def test_distinct_recording_requires_a_separate_check_of_own_test_continuation(self):
        proofs=[dict(physical_source_unresolved=True,middle_visible='person',middle_owner='left')]
        events=[dict(source_role_reobserved=True,action='application_detail')]
        for same,expected in [(True,'left'),(False,'neither')]:
            evidence=dict(index=0,anchor_appearance='plain eye makeup',target_appearance='decorative eye makeup',
                continuation_evidence='observed sequence',recording_relation='distinct_recording',same_test_observed=same)
            request=Mock(return_value=ProviderResult(dict(observations=[evidence]),{},'id'))
            with tempfile.TemporaryDirectory()as directory:
                result=detail.check(proofs,events,[Path('a'),Path('b'),Path('c')],Path('clip'),Path(directory),request)
            self.assertEqual(result[0]['middle_owner'],expected)
        request=Mock()
        self.assertEqual(detail.check(proofs,[dict(action='skin_comparison')],[],None,None,request),proofs)
        request.assert_not_called()
