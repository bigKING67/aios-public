import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import uuid

from content_production.remix_output import derivative_key, output_title


class DerivativeKeyTests(unittest.TestCase):
    """Mirrors `derive_output_key` in the Rust processing backfill."""

    def test_strips_raw_prefix_and_extension(self):
        self.assertEqual(derivative_key("raw/2026/09/a.mp4", "cover", "webp"), "cover/2026/09/a.webp")

    def test_keeps_other_directories(self):
        self.assertEqual(derivative_key("ai-studio/out/b.mp4", "preview", "mp4"), "preview/ai-studio/out/b.mp4")

    def test_handles_bare_names(self):
        self.assertEqual(derivative_key("c", "cover", "webp"), "cover/c.webp")


class OutputTitleTests(unittest.TestCase):
    batch = uuid.UUID("0123456789abcdef0123456789abcdef")

    def test_framework_batches_number_each_output(self):
        self.assertEqual(output_title(None, "精华", self.batch, 3), "框架混剪 · 精华 · 01234567-03")

    def test_edit_batches_have_one_output(self):
        self.assertEqual(output_title("edit", "精华", self.batch, 1), "单条剪辑 · 精华 · 01234567")


if __name__ == "__main__":
    unittest.main()
