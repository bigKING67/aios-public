from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from content_production.caption_layout import wrap_caption


class CaptionLayoutTests(unittest.TestCase):
    def test_compound_phrase_regressions(self):
        self.assertEqual(wrap_caption('头油头痒还掉小雪花的还是用它'), '头油头痒还掉\n小雪花的还是用它')
        self.assertEqual(wrap_caption('里面含有两大黄金成分'), '里面含有\n两大黄金成分')

    def test_protected_names_and_units(self):
        for text, term in [('先试试超级白金洗发水吧', '超级白金洗发水'),
                           ('这款洗发水每瓶含有100毫升', '100毫升')]:
            wrapped = wrap_caption(text, (term,))
            self.assertIn(term, wrapped)
            self.assertTrue(all(len(line) <= 9 for line in wrapped.splitlines()))
            self.assertEqual(wrapped.replace('\n', ''), text)
        with self.assertRaisesRegex(ValueError, 'word-safe'):
            wrap_caption('先试试超级白金洗发水吧', ('试试超级白金洗发水吧',))

    def test_task_dictionary_does_not_mutate_shared_tokenizer(self):
        text = '里面含有两大黄金成分'
        baseline = wrap_caption(text)
        with self.assertRaises(ValueError): wrap_caption(text, (text,))
        self.assertEqual(wrap_caption(text), baseline)

    def test_bad_dictionary_and_unsplittable_text_rejected(self):
        for terms in ['商品', ('',), ('bad\nterm',), (None,)]:
            with self.assertRaises(ValueError): wrap_caption('字幕', terms)
        with self.assertRaisesRegex(ValueError, 'word-safe'): wrap_caption('一二三四五六七八九十')
        with self.assertRaisesRegex(ValueError, 'two-line'): wrap_caption('一' * 19)


if __name__ == '__main__': unittest.main()
