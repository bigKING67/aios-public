import copy
import json
import sys
import types
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from marketing_content_assets import visible_text_contract as contract
from marketing_content_assets.ark_responses import ArkResponsesClient, DEFAULT_ARK_CONTENT_ANALYSIS_MODEL, normalize_content_asset_analysis_contract


def observation():
    return {'coverage':'partial','observations':[{'start_ms':100,'end_ms':1200,'text':'限时活动',
      'role':'promotion','box':[.1,.1,.4,.1],'confidence':.8}]}


class VisibleTextTests(unittest.TestCase):
    def test_existing_video_request_includes_text_schema_and_preserves_result(self):
        captured=[]
        profile=types.SimpleNamespace(fps=2,max_output_tokens=8192,thinking_type='disabled',temperature=0,
                                     store_response=False,reasoning_effort='',json_schema_strict=True,
                                     request_settings=lambda:{'fps':2})
        client=object.__new__(ArkResponsesClient)
        client.config=types.SimpleNamespace(model=DEFAULT_ARK_CONTENT_ANALYSIS_MODEL,analysis_profile=lambda _:profile,
           fusion_analysis_prompt_version='v1',analysis_schema_version='2.1',video_understanding_prompt_version='v2-visible-text')
        def post(payload):
            captured.append(payload)
            value=observation();value['observations'][0]['box']={'left':.1,'top':.1,'right':.5,'bottom':.2}
            return {'output_text':json.dumps({'video_understanding':{'visible_text':value}})}
        client._post=post
        result=client.analyze_video('https://fixture.invalid/source.mp4',asset_context={})
        self.assertEqual(len(captured),1)
        self.assertEqual(captured[0]['model'],'doubao-seed-2-1-lite-260915')
        self.assertEqual(captured[0]['input'][0]['content'][0]['type'],'input_video')
        self.assertIn('visible_text',captured[0]['text']['format']['schema']['properties']['video_understanding']['required'])
        self.assertEqual(result.analysis['video_understanding']['visible_text'],observation())
        self.assertTrue(result.request_settings['prompt_version'].endswith(':visible-text:v2'))

    def test_named_corners_convert_without_guessing_array_convention(self):
        value=observation()
        with self.assertRaises(ValueError):contract.normalize_provider(value)
        value['observations'][0]['box']={'left':.17,'top':.67,'right':.83,'bottom':.72}
        before=copy.deepcopy(value)
        result=contract.normalize_provider(value)
        self.assertEqual(value,before)
        self.assertAlmostEqual(result['observations'][0]['box'][2],.66)
        self.assertAlmostEqual(result['observations'][0]['box'][3],.05)
        value['observations'][0]['box']['bottom']=.5
        with self.assertRaises(ValueError):contract.normalize_provider(value)

    def test_bad_times_boxes_roles_and_nonfinite_confidence_rejected(self):
        for patch in ({'start_ms':True},{'end_ms':100},{'box':[.9,0,.2,.2]},
                      {'role':'erase_now'},{'confidence':float('nan')},{'text':''}):
            value=observation();value['observations'][0].update(patch)
            with self.assertRaises(ValueError):contract.validate(value)
        with self.assertRaises(ValueError):contract.validate({'coverage':'complete','observations':[]})

    def test_missing_legacy_evidence_remains_unknown_and_packaging_is_preserved_as_observation(self):
        result=normalize_content_asset_analysis_contract({})
        self.assertEqual(result['video_understanding']['visible_text'],{'coverage':'unknown','observations':[]})
        value=observation();value['observations'][0].update(role='packaging',box=None)
        self.assertEqual(contract.validate(copy.deepcopy(value)),value)
        self.assertNotIn('erasureAuthorized',value)

if __name__=='__main__':unittest.main()
