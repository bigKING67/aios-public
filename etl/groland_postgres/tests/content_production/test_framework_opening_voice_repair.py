import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock,patch
from content_production import framework_editorial_audit as audit,framework_opening_context as opening
from test_framework_editorial_audit import segment,proof

class OpeningVoiceRepair(unittest.TestCase):
    def test_complete_review_resolution_still_checks_previously_suppressed_voice_claim(self):
        rows=[segment(0,4000,'mixed_voiceover'),segment(4000,80000)]
        first=proof(opening='montage_sequence')
        first.update(a_person_is_speaking='yes',b_person_is_speaking='yes',same_voice='yes',same_person='yes')
        full=dict(start_ms=0,target_start_ms=4000,end_ms=80000,payload=dict(target_role='independent_review',evidence='whole review'))
        voice=dict(reference_words='A actual',target_words='B actual',reference_speakers='one',target_speakers='one',match='all',evidence='actual same voice')
        with tempfile.TemporaryDirectory()as tmp,patch.object(audit,'run_probe',return_value='{"streams":[{"index":1}]}'),\
                patch.object(audit.speaker,'bind_reference',return_value=dict(visual_link='different_review',speaker_reference=dict(start_ms=0,end_ms=2000))),\
                patch.object(audit,'observe',side_effect=[first,proof(),proof()]),\
                patch.object(opening,'observe',return_value=full),\
                patch.object(audit.speaker,'observe',return_value=voice)as check:
            result,receipt=audit.verify(rows,Path('source'),80000,Path(tmp),{},lambda:None,Mock(),windows=[])
        self.assertEqual(result,rows);check.assert_called_once()
        self.assertEqual(receipt['voiceChecks'],1)
        self.assertEqual(receipt['observations'][0]['proof']['opening_link'],'montage_sequence')
        self.assertEqual(receipt['observations'][0]['proof']['voice_check'],voice)
