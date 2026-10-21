import unittest
from content_production import framework_source_roles as roles


class SourceRoles(unittest.TestCase):
    def test_unknown_subject_application_detail_does_not_invent_a_presenter(self):
        from content_production import framework_event_observations as o
        payload=dict(events=[dict(start=0,end=4,unit='',person='',appearance='eye application closeup',
                                 visible='person',action='application_detail')])
        event=o.decode(payload)['events'][0]
        self.assertEqual(event['kind'],'own_detail')
        self.assertEqual(event['person'],'')
        self.assertNotIn('application_detail',o.schema()['properties']['events']['items']['properties']['action']['enum'])
        self.assertIn('application_detail',roles.schema()['properties']['events']['items']['properties']['action']['enum'])
    def test_repeated_detail_evidence_triggers_reobservation_of_coarse_speaker(self):
        original=[dict(start_ms=0,end_ms=30000,action='talking_demo')]
        detailed=[dict(start_ms=a,end_ms=b,source_observed_kind='own_detail')
                  for a,b in [(4000,10000),(14000,24000)]]
        self.assertEqual(len(roles.targets(original,detailed)),1)
        self.assertEqual(roles.targets(original,detailed[:1]),[])
        self.assertEqual(roles.targets([dict(original[0],action='personal_application')],detailed),[])
        # Mere brief close-ups are compatible; they do not buy a fresh video.
        self.assertEqual(roles.targets(original,[dict(e,end_ms=e['start_ms']+500)for e in detailed]),[])


if __name__=='__main__':
    unittest.main()
