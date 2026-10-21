import contextlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production import segment_suggestion_queue as queue
from content_production import segment_suggestion_worker as worker
from content_production.framework_v2 import review, rules
from content_production.framework_v2.frames import Frames
from content_production.segment_suggestion_provider import LIVE_ENV, SuggestionError, provider_from_env

LIVE, MIXED, STREET, PROMO = rules.LIVE, rules.MIXED, rules.STREET, rules.PROMOTION


def facts(subject='person', style='selfie_ugc', celebrity=False, offer=False):
    return {'subject': subject, 'people_count': 1, 'talking_to_camera': True, 'style': style,
            'celebrity_tag': celebrity, 'offer_text': offer, 'using_product': True, 'note': ''}


def shot(start, end, chain=None, ocr=(), **kw):
    return {'start': start, 'end': end, 'facts': facts(**kw), 'chain': chain, 'ocr': list(ocr)}


class RuleTests(unittest.TestCase):
    def test_one_person_for_ten_seconds_is_live_and_two_people_do_not_add_up(self):
        segs, runs = rules.segment([shot(0, 6, chain=1), shot(6, 12, chain=1), shot(12, 18, chain=2), shot(18, 24, chain=3)], 24)
        self.assertEqual(segs, [[0.0, 12, LIVE], [12, 24, MIXED]])
        self.assertEqual(runs, [(0, 12), (12, 18), (18, 24)])

    def test_faceless_own_close_ups_at_the_edges_belong_to_the_review(self):
        segs, _ = rules.segment([shot(0, 3, subject='closeup'), shot(3, 9, chain=1), shot(9, 11, subject='closeup'),
                                 shot(11, 20, chain=7, style='studio_ad', subject='product')], 20)
        self.assertEqual(segs[0], [0.0, 11, LIVE])

    def test_brand_ad_and_borrowed_clip_interrupt_continuity(self):
        segs, _ = rules.segment([shot(0, 6, chain=1), shot(6, 8, subject='product', style='studio_ad'), shot(8, 14, chain=1),
                                 shot(14, 16, chain=5, celebrity=True), shot(16, 22, chain=1)], 22)
        self.assertNotIn(LIVE, [lab for *_, lab in segs])

    def test_name_tag_on_most_shots_is_a_watermark_not_a_borrowed_clip(self):
        tagged = [shot(k * 4, k * 4 + 4, chain=1, celebrity=True) for k in range(5)]
        segs, _ = rules.segment(tagged, 20)
        self.assertEqual(segs, [[0.0, 20, LIVE]])

    def test_long_uncut_take_of_a_person_is_their_own_footage(self):
        segs, _ = rules.segment([shot(0, 3, chain=9, celebrity=True), shot(3, 40, chain=1, style='studio_ad', celebrity=True)], 40)
        self.assertEqual(segs[-1], [3, 40, LIVE])

    def test_street_interview_and_promo_page(self):
        segs, _ = rules.segment([shot(0, 8, chain=1, style='street_interview'), shot(8, 12, subject='graphic', style='promo_graphic')], 12)
        self.assertEqual(segs, [[0.0, 8, STREET], [8, 12, PROMO]])

    def test_closing_promo_block_needs_dense_offer_cues_and_ignores_static_text(self):
        body = [shot(k * 5, k * 5 + 5, chain=k + 10, ocr=['沪G妆网备字2026']) for k in range(10)]
        tail = [shot(50, 55, subject='product', style='studio_ad', ocr=['到手价99元', '沪G妆网备字2026']),
                shot(55, 60, subject='product', style='studio_ad', ocr=['下单链接'])]
        segs, _ = rules.segment(body + tail, 60)
        self.assertEqual(segs[-1], [50, 60, PROMO])
        sparse = body + [shot(50, 51, subject='product', style='studio_ad', ocr=['99元']),
                         shot(51, 60, subject='product', style='studio_ad')]
        self.assertEqual(rules.segment(sparse, 60)[0][-1][2], MIXED)

    def test_price_tail_of_own_review_stays_in_the_review(self):
        segs, _ = rules.segment([shot(0, 12, chain=1), shot(12, 14, subject='closeup', style='promo_graphic')], 14)
        self.assertEqual(segs, [[0.0, 14, LIVE]])

    def test_short_islands_are_absorbed_and_timeline_is_contiguous(self):
        segs, _ = rules.segment([shot(0, 11, chain=1), shot(11.2, 12, chain=2, style='street_interview'), shot(12, 30, chain=3)], 30)
        self.assertEqual(segs[0][0], 0.0)
        self.assertEqual(segs[-1][1], 30)
        self.assertTrue(all(a[1] == b[0] for a, b in zip(segs, segs[1:])))


class FinalizeTests(unittest.TestCase):
    def test_short_live_made_only_of_studio_shots_is_a_brand_clip(self):
        shots = [shot(0, 10, chain=1), shot(10, 25, chain=2, style='studio_ad'), shot(25, 30, subject='graphic', style='promo_graphic')]
        self.assertEqual(rules.finalize([[0, 10, MIXED], [10, 25, LIVE], [25, 30, PROMO]], shots), [[0, 25, MIXED], [25, 30, PROMO]])
        long_take = [shot(0, 35, chain=1, style='studio_ad')]
        self.assertEqual(rules.finalize([[0, 35, LIVE]], long_take), [[0, 35, LIVE]])
        mixed_styles = [shot(0, 8, chain=1, style='studio_ad'), shot(8, 20, chain=1)]
        self.assertEqual(rules.finalize([[0, 20, LIVE]], mixed_styles), [[0, 20, LIVE]])

    def test_outside_insert_splits_a_reviewed_review_and_short_pieces_become_mixed(self):
        own = [shot(0, 11, chain=1), shot(11, 13, subject='closeup', style='studio_ad'), shot(13, 20, chain=1)]
        own[1].update(kind='ad', bg_near=0.03)
        self.assertEqual(rules.finalize([[0, 20, LIVE]], own), [[0, 11, LIVE], [11, 20, MIXED]])
        own[1]['bg_near'] = 0.7  # the presenter's own close-up in the same scene keeps the review whole
        self.assertEqual(rules.finalize([[0, 20, LIVE]], own), [[0, 20, LIVE]])

    def test_endorsement_tags_make_short_footage_mixed_but_long_own_reviews_stay_live(self):
        tagged = [shot(0, 8, chain=1, ocr=['ally爱用底妆']), shot(8, 16, chain=1, ocr=['痞幼同款', '刷睫小技巧'])]
        self.assertEqual(rules.finalize([[0, 16, LIVE]], tagged), [[0, 16, MIXED]])
        watermark = [shot(k * 10, k * 10 + 10, chain=1, ocr=['@明星李颖']) for k in range(5)]
        self.assertEqual(rules.finalize([[0, 50, LIVE]], watermark), [[0, 50, LIVE]])
        speech = [shot(0, 16, chain=1, ocr=['我也是看痞幼推荐买的'])]
        self.assertEqual(rules.finalize([[0, 16, LIVE]], speech), [[0, 16, LIVE]])

    def test_short_live_where_nobody_speaks_on_camera_is_a_dubbed_clip(self):
        dubbed = [dict(shot(0, 6, chain=1), mouth=0.01), dict(shot(6, 12, chain=1), mouth=0.015)]
        self.assertEqual(rules.finalize([[0, 12, LIVE]], dubbed), [[0, 12, MIXED]])
        speaking = [dict(shot(0, 6, chain=1), mouth=0.05), dict(shot(6, 12, chain=1), mouth=0.04)]
        self.assertEqual(rules.finalize([[0, 12, LIVE]], speaking), [[0, 12, LIVE]])
        silent_demo = [dict(shot(0, 25, chain=1), mouth=0.01)]  # long silent product use with own voice-over
        self.assertEqual(rules.finalize([[0, 25, LIVE]], silent_demo), [[0, 25, LIVE]])
        no_face = [dict(shot(0, 12, chain=1), mouth=None)]
        self.assertEqual(rules.finalize([[0, 12, LIVE]], no_face), [[0, 12, LIVE]])

    def test_reviewed_live_spanning_two_people_is_split_and_short_pieces_are_mixed(self):
        two = [shot(0, 8, chain=1), shot(8, 25, chain=2)]
        self.assertEqual(rules.finalize([[0, 25, LIVE]], two), [[0, 8, MIXED], [8, 25, LIVE]])
        flicker = [shot(0, 9, chain=1), shot(9, 10.5, chain=2), shot(10.5, 20, chain=1)]  # 1.5s face shot: chain noise
        self.assertEqual(rules.finalize([[0, 20, LIVE]], flicker), [[0, 20, LIVE]])

    def test_short_silent_piece_left_by_a_person_split_is_still_checked(self):
        shots = [dict(shot(0, 6, chain=1), mouth=0.01), dict(shot(6, 12, chain=1), mouth=0.01),
                 dict(shot(12, 18, chain=2), mouth=0.05)]
        # 0-18 is too long for the silent check; the split leaves a silent 12s piece and a 6s second person.
        self.assertEqual(rules.finalize([[0, 18, LIVE]], shots), [[0, 18, MIXED]])

    def test_mouth_is_measured_only_for_short_live_segments(self):
        shots = [shot(0, 6, chain=1), shot(6, 12, chain=1), shot(12, 40, chain=2)]
        asked = []

        def measure(spans):
            asked.extend(spans)
            return [0.01] * len(spans)
        out = rules.finalize([[0, 12, LIVE], [12, 40, MIXED]], shots, measure)
        self.assertEqual(asked, [(0, 6), (6, 12)])
        self.assertEqual(out, [[0, 40, MIXED]])

    def test_offer_copy_in_mid_film_is_a_promotion_block(self):
        shots = [shot(0, 20, chain=1), shot(20, 23, ocr=['双11大促 拍2发10']), shot(23, 25, ocr=['下单立减']),
                 shot(25, 27, subject='closeup'), shot(27, 30, ocr=['199元到手']), shot(30, 60, chain=2)]
        out = rules.finalize([[0, 20, LIVE], [20, 30, MIXED], [30, 60, LIVE]], shots)
        self.assertEqual(out, [[0, 20, LIVE], [20, 30, PROMO], [30, 60, LIVE]])
        hint = [shot(0, 20, chain=1), shot(20, 30, ocr=['取够粉之后在手心给它拍一下', '具体到手价格因人而异']), shot(30, 60, chain=2)]
        self.assertEqual(rules.finalize([[0, 20, LIVE], [20, 30, MIXED], [30, 60, LIVE]], hint),
                         [[0, 20, LIVE], [20, 30, MIXED], [30, 60, LIVE]])

    def test_closing_promotion_starts_at_the_first_offer_and_keeps_own_review(self):
        shots = [shot(0, 60, chain=1), shot(60, 70, ocr=['现在赶上直播间限时宠粉福利']), shot(70, 80, chain=2),
                 shot(80, 90, ocr=['能抢到的抓紧冲'])]
        out = rules.finalize([[0, 60, LIVE], [60, 85, MIXED], [85, 90, PROMO]], shots)
        self.assertEqual(out, [[0, 60, LIVE], [60, 90, PROMO]])

    def test_disclaimers_and_other_word_senses_are_not_offers(self):
        shots = [shot(0, 50, chain=1), shot(50, 60, ocr=['具体活动以直播间活动为准']), shot(60, 70, ocr=['对冲脸上黄气']),
                 shot(70, 80, ocr=['199元到手'])]
        out = rules.finalize([[0, 50, MIXED], [50, 80, PROMO]], shots)
        self.assertEqual(out, [[0, 70, MIXED], [70, 80, PROMO]])

    def test_ocr_fragments_of_a_standing_disclaimer_are_not_offers(self):
        standing = '具体福利优惠以直播间链接为准'
        shots = [shot(k * 10, k * 10 + 10, chain=1, ocr=[standing]) for k in range(5)]
        shots += [shot(50, 55, ocr=[standing, '体福利']), shot(55, 60, ocr=[standing, '199元到手']), shot(60, 65, ocr=[standing])]
        out = rules.finalize([[0, 50, MIXED], [50, 65, PROMO]], shots)
        self.assertEqual(out, [[0, 55, MIXED], [55, 65, PROMO]])

    def test_promotion_backed_by_an_offer_page_does_not_shrink(self):
        shots = [shot(0, 50, chain=1), shot(50, 60, subject='graphic', style='promo_graphic'), shot(60, 70, ocr=['快来直播间'])]
        self.assertEqual(rules.finalize([[0, 50, MIXED], [50, 70, PROMO]], shots), [[0, 50, MIXED], [50, 70, PROMO]])

    def test_no_closing_call_to_action_leaves_the_timeline_alone(self):
        segs = [[0, 50, MIXED], [50, 70, PROMO]]
        self.assertEqual(rules.finalize(segs, [shot(0, 50, chain=1), shot(50, 70, ocr=['精油质地'])]), segs)


class ReviewApplyTests(unittest.TestCase):
    def test_review_overrides_live_and_mixed_inside_window_and_snaps_to_cuts(self):
        segs = [[0.0, 20, MIXED], [20, 40, LIVE], [40, 50, STREET]]
        payload = {'segments': [{'start': 0, 'end': 12.4, 'label': '实拍内容', 'reason': ''},
                                {'start': 12.4, 'end': 47, 'label': '混剪口播', 'reason': ''}]}
        out = review.apply(segs, [5.0, 17.0, 30.0], 5.0, 52.0, payload)
        self.assertEqual(out, [[0.0, 5.0, MIXED], [5.0, 17.0, LIVE], [17.0, 40, MIXED], [40, 50, STREET]])
        self.assertEqual(out[-1][1], segs[-1][1])

    def test_windows_cover_live_segments_and_unaccepted_runs(self):
        wins = review.windows([[0, 30, MIXED], [30, 50, LIVE], [50, 60, MIXED]], [(5, 11), (30, 50), (53, 55)], 60)
        self.assertEqual(wins, [[2.0, 14.0], [27.0, 53.0]])

    def test_failed_review_keeps_rule_output(self):
        class Provider:
            def review(self, *args, **kwargs):
                raise SuggestionError('provider_error', 'boom', {'input_tokens': 10})
        segs = [[0.0, 20.0, LIVE]]
        with tempfile.TemporaryDirectory() as tmp, patch.object(review, 'clip', lambda *a: Path(tmp) / 'c.mp4'):
            out, receipts = review.review(Provider(), Path('x.mp4'), segs, [], [], 20.0, Path(tmp), {})
        self.assertEqual(out, segs)
        self.assertEqual(receipts[0]['error'], 'provider_error')
        self.assertEqual(receipts[0]['usage'], {'input_tokens': 10})


class FramesTests(unittest.TestCase):
    def test_one_forward_decode_returns_the_frames_a_seek_returns(self):
        import cv2
        import numpy as np
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / 'v.avi')
            out = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*'MJPG'), 25, (64, 48))
            for k in range(100):
                frame = np.zeros((48, 64, 3), np.uint8)
                frame[:, :, 0] = k * 2
                frame[: k % 48, :, 1] = 255
                out.write(frame)
            out.release()
            times = [0.0, 0.37, 1.02, 2.5, 3.98, 9.0]
            frames = Frames(path, [(t, 32) for t in times] + [(1.02, 64)])
            cap = cv2.VideoCapture(path)
            for t in times:
                cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
                ok, seek = cap.read()
                got = frames.get(t, 32)
                if not ok:
                    self.assertIsNone(got)
                    continue
                self.assertTrue(np.array_equal(cv2.resize(seek, (32, 24)), got), t)
            cap.release()
            self.assertEqual(frames.get(1.02, 64).shape, (48, 64, 3))
            self.assertIsNone(frames.get(1.5, 32))


class MouthProbeTests(unittest.TestCase):
    def test_probe_contract_and_failures(self):
        from content_production.framework_v2 import mouth
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp) / 'python'
            fake.write_text('#!/bin/sh\ncat >/dev/null\necho \'{"mouth": [0.01, null]}\'\n')
            fake.chmod(0o755)
            model = Path(tmp) / 'face_landmarker.task'
            model.write_bytes(b'x')
            with patch.dict(os.environ, {mouth.PYTHON_ENV: str(fake), mouth.MODEL_ENV: str(model)}):
                self.assertEqual(mouth.shot_mouth('v.mp4', [(0, 1), (1, 2)]), [0.01, None])
                with self.assertRaises(RuntimeError):
                    mouth.shot_mouth('v.mp4', [(0, 1)])
                with self.assertRaises(RuntimeError):
                    mouth.check()  # model bytes do not match the pinned digest
            with patch.dict(os.environ, {mouth.PYTHON_ENV: '', mouth.MODEL_ENV: ''}):
                with self.assertRaises(RuntimeError):
                    mouth.shot_mouth('v.mp4', [(0, 1)])


class WorkerConfigTests(unittest.TestCase):
    def setUp(self):
        env = {key: value for key, value in os.environ.items()
               if key != LIVE_ENV and not key.startswith('CONTENT_AI_STUDIO_')}
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.dict(os.environ, env, clear=True))

    def test_claim_filter_defaults_to_claiming_everything(self):
        self.assertEqual(worker.claim_filter_from_env(), {'dimensions': None, 'fallback_after_seconds': None})

    def test_claim_filter_parses_and_validates(self):
        os.environ[worker.DIMENSIONS_ENV] = 'framework'
        os.environ[worker.FALLBACK_ENV] = '600'
        self.assertEqual(worker.claim_filter_from_env(), {'dimensions': ['framework'], 'fallback_after_seconds': 600})
        os.environ[worker.DIMENSIONS_ENV] = 'framework,unknown'
        with self.assertRaises(ValueError):
            worker.claim_filter_from_env()
        del os.environ[worker.DIMENSIONS_ENV]
        with self.assertRaises(ValueError):
            worker.claim_filter_from_env()

    def test_heartbeat_interval_stays_inside_the_lease(self):
        self.assertEqual(worker.heartbeat_seconds(), 1)
        os.environ[worker.HEARTBEAT_ENV] = '15'
        self.assertEqual(worker.heartbeat_seconds(), 15)
        os.environ[worker.HEARTBEAT_ENV] = '120'
        with self.assertRaises(ValueError):
            worker.heartbeat_seconds()

    def test_concurrency_defaults_to_one_and_is_bounded(self):
        self.assertEqual(worker.concurrency(), 1)
        os.environ[worker.CONCURRENCY_ENV] = '4'
        self.assertEqual(worker.concurrency(), 4)
        for bad in ('0', '9', 'two'):
            os.environ[worker.CONCURRENCY_ENV] = bad
            with self.assertRaises(ValueError):
                worker.concurrency()

    def test_local_v2_provider_needs_the_live_flag(self):
        os.environ['CONTENT_AI_STUDIO_SEGMENT_SUGGEST_PROVIDER'] = 'local-v2'
        with self.assertRaises(RuntimeError):
            provider_from_env()


class ClaimSqlTests(unittest.TestCase):
    class Cursor:
        def __init__(self):
            self.sql = []

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, sql, params=None):
            self.sql.append((sql, params))

        def fetchone(self):
            return None

    class Conn:
        def __init__(self, cursor):
            self._cursor = cursor

        def cursor(self, **_kwargs):
            return self._cursor

        def commit(self):
            pass

    def test_unfiltered_claim_keeps_the_original_query(self):
        cur = self.Cursor()
        self.assertIsNone(queue.claim(self.Conn(cur)))
        self.assertNotIn('content_segment_presets', cur.sql[1][0])

    def test_filtered_claim_joins_presets_and_passes_fallback(self):
        cur = self.Cursor()
        queue.claim(self.Conn(cur), dimensions=['framework'], fallback_after_seconds=600)
        sql, params = cur.sql[1]
        self.assertIn('p.dimension = ANY(%s)', sql)
        self.assertIn('FOR UPDATE OF j SKIP LOCKED', sql)
        self.assertEqual(params, (['framework'], 600, 600))


if __name__ == '__main__':
    unittest.main()
