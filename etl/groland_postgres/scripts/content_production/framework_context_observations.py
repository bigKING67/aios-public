"""Explicit video evidence for graphics covering an ongoing presenter shot."""

GUIDANCE = '''\n另逐图填写presenter_overlay_1/2/3：只有视频证明原主讲人拍摄仍在继续、原画面只是被叠加的检测报告/示意图大面积遮挡时为true。图片中仍能看到原人物头发/衣物或原场景、视频前后动作连续，可据此核对；不能因为有同一旁白、角标或小头像就填true。切到独立产品广告/成分动画/包装摆拍、其他人物画面必须false。该字段仅描述叠图事实，不做业务分类；无法确认填false。'''


def schema(base):
    fields = {f'presenter_overlay_{i}': {'type':'boolean'} for i in (1,2,3)}
    return dict(base, required=[*base['required'], *fields], properties={**base['properties'], **fields})


def normalize(proof):
    kinds = proof.get('kinds')
    flags = [proof.get(f'presenter_overlay_{i}') for i in (1,2,3)]
    if (not isinstance(kinds,list) or len(kinds) != 3 or any(type(v) is not bool for v in flags)
            or any(k not in ('presenter','own_detail','independent_insert','other') for k in kinds)):
        raise ValueError('Invalid contextual presenter/overlay evidence')
    kinds = list(kinds)
    relations = [proof.get('left_to_middle'), proof.get('middle_to_right')]
    # Require a real, unobscured presenter anchor and an explicitly observed
    # same-flow connection. A flag cannot make three unknown frames continuous.
    anchored = {i for i,k in enumerate(kinds) if k == 'presenter' and not flags[i]}
    for _ in range(2):
        for i in range(3):
            if flags[i] and any(j in anchored and relations[min(i,j)] in ('same_review','own_detail')
                                for j in (i-1,i+1) if 0 <= j < 3):
                kinds[i] = 'presenter'
                anchored.add(i)
    return dict(proof,kinds=kinds)
