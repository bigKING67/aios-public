import unittest
from content_production.framework_editorial_audit import different_speakers_resolved


class VoiceResolutionTests(unittest.TestCase):
    def setUp(self):
        self.proof=dict(same_person='no',b_person_is_speaking='yes',
            voice_check=dict(match='none',reference_speakers='one',target_speakers='one'))

    def test_distinct_visible_speakers_resolve_prior_voice_hypothesis(self):
        self.assertTrue(different_speakers_resolved(self.proof))
        self.assertTrue(different_speakers_resolved(dict(self.proof,same_person='uncertain',
            identity_check=dict(a_matches_b='no',b_same_person='yes'))))

    def test_uncertain_or_conflicting_identity_stays_unresolved(self):
        for value in ['yes','uncertain']:
            self.assertFalse(different_speakers_resolved(dict(self.proof,same_person=value)))
        for value in ['no','uncertain']:
            self.assertFalse(different_speakers_resolved(dict(self.proof,b_person_is_speaking=value)))

    def test_missing_partial_or_uncertain_audio_cannot_clear_warning(self):
        self.assertFalse(different_speakers_resolved(dict(self.proof,voice_check={})))
        for match in ['all','part','uncertain']:
            self.assertFalse(different_speakers_resolved(dict(self.proof,
                voice_check=dict(self.proof['voice_check'],match=match))))
        for key in ['reference_speakers','target_speakers']:
            for value in ['none','multiple','uncertain']:
                self.assertFalse(different_speakers_resolved(dict(self.proof,
                    voice_check=dict(self.proof['voice_check'],**{key:value}))))


if __name__=='__main__':unittest.main()
