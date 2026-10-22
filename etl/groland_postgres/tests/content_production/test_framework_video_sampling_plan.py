"""Coverage regression for the real short-middle-interval failure mode."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT/'.trellis/tasks/10-18-framework-split-v2/research/harness'))
import video_sampling_plan as sampling


def case():
    return dict(intervals=[[44.667,46.667],[46.667,48.4],[48.4,60.3]],
        physicalCuts=[46.667,48.4], clipMetadata={'streams':[{'nb_frames':'468','avg_frame_rate':'30/1'}],
                                               'format':{'duration':'15.6'}})


def test_short_source_intervals_need_more_than_eight_uniform_frames():
    before = sampling.coverage(case(), 8)
    assert before['groupCoverage'] == {'A':1,'B':1,'C':6}
    assert not before['coveragePassed']
    plan = sampling.choose(case())
    assert plan['status'] == 'ready'
    assert plan['selected']['frameCount'] == 16
    assert plan['selected']['groupCoverage'] == {'A':2,'B':2,'C':12}
    assert all(s['frames'] >= 2 for s in plan['selected']['physicalShotCoverage'])


def test_a_brief_physical_insert_cannot_hide_inside_a_well_covered_group():
    source = case()
    source['physicalCuts'].extend([50,50.05])
    plan = sampling.choose(source)
    assert plan['status'] == 'requires_split'
    assert plan['selected'] is None
    assert any(p['groupCoverage']['A'] >= 2 for p in plan['checked'])
    assert all(not p['coveragePassed'] for p in plan['checked'])


@pytest.mark.parametrize('change', ['rate','duration','cut','overlap'])
def test_invalid_time_mapping_is_rejected(change):
    source = case()
    if change == 'rate':source['clipMetadata']['streams'][0]['avg_frame_rate']='0/1'
    if change == 'duration':source['clipMetadata']['format']['duration']='31'
    if change == 'cut':source['physicalCuts'].append(float('nan'))
    if change == 'overlap':source['intervals'][1][0]-=.1
    with pytest.raises(ValueError):sampling.choose(source)


def test_changed_parent_gold_does_not_create_a_new_experiment(tmp_path):
    parent=tmp_path/'parent';parent.mkdir();output=tmp_path/'output'
    sampling.write(parent/'cases.json', [case()])
    sampling.write(parent/'expected.json', {'original':'label'})
    sampling.write(parent/'plan.json', {'casesSha256':sampling.file_hash(parent/'cases.json'),
                                       'expectedSha256':sampling.file_hash(parent/'expected.json')})
    sampling.write(parent/'expected.json', {'changed':'label'})
    with pytest.raises(ValueError,match='Frozen parent'):sampling.prepare(parent,output)
    assert not output.exists()
