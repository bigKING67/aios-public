"""Bulk fixtures must reject accidental real targets before any connection."""
import unittest
from batch_measurement import validate_fixture_targets


class FixtureTargetsTests(unittest.TestCase):
    def test_only_named_disposable_loopback_database_is_allowed(self):
        redis = "redis://127.0.0.1:40001"
        validate_fixture_targets("postgresql://fixture:fixture@127.0.0.1:40000/content_production_e2e", redis)
        for target in ["postgresql://user:pass@production.invalid:5432/content_production_e2e",
                       "postgresql://user:pass@127.0.0.1:5432/aios",
                       "postgresql://user:pass@127.0.0.1/content_production_e2e"]:
            with self.assertRaises(ValueError):
                validate_fixture_targets(target, redis)
        with self.assertRaises(ValueError):
            validate_fixture_targets("postgresql://fixture:fixture@127.0.0.1:40000/content_production_e2e", "redis://production.invalid:6379")
