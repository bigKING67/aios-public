import tempfile
import json
import unittest
from pathlib import Path

from content_production.framework_eval_runtime import Budget
from content_production.framework_failure_queue import write_queue
from content_production.segment_suggestion_provider import SuggestionError


class EvaluationRecovery(unittest.TestCase):
    def test_causal_location_keeps_code_coordinates_without_exception_data(self):
        from content_production.framework_evals import failure_location, scope_for
        try:
            try:
                scope_for({'films': {}}, 'private-fixture-marker')
            except ValueError as cause:
                raise RuntimeError('private-fixture-marker') from cause
        except RuntimeError as error:
            locations = failure_location(error)
        self.assertEqual([entry['error'] for entry in locations], ['RuntimeError', 'ValueError'])
        self.assertEqual(locations[1]['locations'][-1]['function'], 'scope_for')
        self.assertEqual(locations[1]['locations'][-1]['file'], 'content_production/framework_evals.py')
        self.assertNotIn('private-fixture-marker', json.dumps(locations))

    def test_consecutive_remote_failures_stop_new_spend_but_preserve_count(self):
        budget = Budget(20)
        budget.claim()
        budget.remote_result(SuggestionError('provider_error', 'transport failed'))
        budget.remote_result()
        self.assertEqual(budget.provider_failures, 0)
        for _ in range(3):
            budget.claim()
            budget.remote_result(SuggestionError('provider_error', 'transport failed'))
        with self.assertRaisesRegex(ValueError, 'provider unavailable'):
            budget.claim()
        self.assertEqual(budget.used, 4)
        # A late in-flight success cannot silently reopen the stopped batch.
        budget.remote_result()
        with self.assertRaisesRegex(ValueError, 'provider unavailable'):
            budget.claim()

    def test_passing_threshold_keeps_residual_errors_in_repair_queue(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            metrics = [dict(film='small', failures=[], workerError=None, source='small.mp4',
                            errors=[dict(start=2, end=3)]),
                       dict(film='large', failures=['below_minimum'], workerError=None,
                            source='large.mp4', errors=[dict(start=0, end=20)])]
            queue = write_queue(output, dict(films=metrics, assertions=[]), [])['items']
            self.assertEqual([row['film'] for row in queue], ['large', 'small'])
            self.assertTrue(queue[1]['adoptionBlocking'])
            self.assertEqual(queue[1]['errorSeconds'], 1)
            self.assertTrue((output/'repair-brief.md').is_file())

    def test_auxiliary_disagreement_is_visible_even_when_labels_match(self):
        warning = dict(start_ms=1000, end_ms=12000, match='none',
                       resolution='external_narrator_not_established')
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            metric = dict(film='matched', failures=[], errors=[], workerError=None,
                          source='matched.mp4', auxiliaryWarnings=[warning])
            queue = write_queue(output, dict(films=[metric], assertions=[]), [])['items']
            self.assertEqual(len(queue), 1)
            self.assertEqual(queue[0]['category'], 'auxiliary_evidence')
            self.assertEqual(queue[0]['auxiliaryWarnings'], [warning])
            self.assertEqual(queue[0]['errorSeconds'], 0)
            self.assertTrue(queue[0]['adoptionBlocking'])


if __name__ == '__main__':
    unittest.main()
