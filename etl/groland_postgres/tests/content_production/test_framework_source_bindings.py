import unittest
from content_production import framework_source_roles as roles
from content_production import framework_composition as composition
from content_production import framework_promotion as promotion
from content_production import framework_editorial_audit as editorial


def event(a,b,unit,**kwargs):
    return dict(start_ms=a,end_ms=b,unit=unit,kind='presenter',person=unit,**kwargs)


class SourceBindings(unittest.TestCase):
    def proof(self, relation='same_review'):
        return dict(kinds=['presenter']*3,same_outer_person=True,
                    left_to_middle=relation,middle_to_right=relation)

    def test_reobserved_namespace_needs_real_source_binding(self):
        rows=[event(0,5000,'old'),event(5000,20000,'new',source_parent_unit='old')]
        result=roles.reconcile_units(rows,lambda _:self.proof())
        self.assertEqual(result[1]['unit'],'old')
        self.assertEqual(rows[1]['unit'],'new')
        result=roles.reconcile_units(rows,lambda _:self.proof('different_person'))
        self.assertEqual(result[1]['unit'],'new')

    def test_source_binding_never_crosses_real_insert(self):
        rows=[event(0,5000,'old'),dict(start_ms=5000,end_ms=6000,kind='independent_insert',unit=''),
              event(6000,20000,'new',source_parent_unit='old')]
        result=roles.reconcile_units(rows,lambda _:self.fail('Cannot cross insert'))
        self.assertEqual(result[-1]['unit'],'new')

    def test_recurring_host_is_a_question_not_a_label(self):
        target=dict(start_ms=10000,end_ms=22000,label_key='live_demo')
        rows=[event(10000,22000,'A',action='talking_demo'),
              dict(start_ms=22000,end_ms=25000,kind='independent_insert',unit=''),
              event(25000,30000,'A',action='personal_application')]
        windows=[dict(start=0,end=40000,events=rows)]
        witness=composition.recurring_presenter(target,windows)
        self.assertEqual(witness,dict(insert=[22,25],return_scene=[25,30]))
        self.assertEqual(target['label_key'],'live_demo')
        rows[1]['outro_unit']='A'
        self.assertIsNone(composition.recurring_presenter(target,windows))

    def test_distant_insert_cannot_explain_the_target_boundary(self):
        target=dict(start_ms=10000,end_ms=22000,label_key='live_demo')
        rows=[event(10000,22000,'A',action='personal_application'),
              event(22000,28000,'B',action='talking_demo'),
              dict(start_ms=28000,end_ms=30000,kind='independent_insert',unit=''),
              event(30000,34000,'A',action='talking_demo')]
        windows=[dict(start=0,end=40000,events=rows)]
        self.assertIsNone(composition.recurring_presenter(target,windows))

    def test_adjacent_talking_reviews_remain_protected_without_recurrence(self):
        rows=[dict(start_ms=0,end_ms=10000,label_key='mixed_voiceover'),
              dict(start_ms=10000,end_ms=19700,label_key='live_demo'),
              dict(start_ms=19700,end_ms=29200,label_key='live_demo')]
        windows=[dict(start=0,end=29200,events=[event(10000,19700,'A',action='talking_demo'),
            event(19700,29200,'B',action='talking_demo')])]
        targets,protected=composition.plan(rows,windows,29200)
        self.assertEqual(targets,[])
        self.assertEqual(len(protected),2)

    def test_missing_offer_is_observed_without_assuming_packshots_are_promotions(self):
        segments=[dict(start_ms=0,end_ms=12000,label_key='mixed_voiceover')]
        windows=[dict(events=[dict(start_ms=2000,end_ms=6000,kind='independent_insert',action='packaging_display')])]
        targets=promotion.plan(segments,windows)
        self.assertEqual(len(targets),1)
        result,changes=promotion.apply(segments,targets,dict(items=[dict(index=0,
            role='recommendation_material',linked_index=-1,evidence='Product appearance only')]))
        self.assertEqual((result,changes),(segments,[]))

    def test_later_offer_stage_retains_original_mixed_boundaries(self):
        segments=[dict(start_ms=0,end_ms=17000,label_key='mixed_voiceover'),
                  dict(start_ms=17000,end_ms=35000,label_key='mixed_voiceover')]
        result,_=editorial.apply(segments,[],[],coalesce=False)
        self.assertEqual(result,segments)
        self.assertEqual(len(editorial.apply(segments,[],[])[0]),1)


if __name__=='__main__':
    unittest.main()
