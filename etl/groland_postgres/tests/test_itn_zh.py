"""Conservative Chinese ITN for local ASR transcripts: numbers converted, words untouched."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from marketing_content_assets.itn_zh import normalize, to_int  # noqa: E402


class ItnTests(unittest.TestCase):
  def test_numbers_are_converted(self):
    cases = {
      "之前九十九一支舍不得买，现在下单立减六十": "之前99一支舍不得买，现在下单立减60",
      "小树美二点零和三点零究竟有什么区别": "小树美2.0和3.0究竟有什么区别",
      "百分之三十的人都在用": "30%的人都在用",
      "百分之九十九点五": "99.5%",
      "我今年五十七了": "我今年57了",
      "现在是十一点十六分": "现在是11点16分",
      "一百零五块": "105块",
      "二百五十毫升": "250毫升",
      "一万二的销量": "12000的销量",
      "两百支": "200支",
      "一点五倍": "1.5倍",
    }
    for text, expected in cases.items():
      self.assertEqual(normalize(text), expected, text)

  def test_words_and_single_numerals_stay(self):
    for text in ("三资堂的遮瑕液", "一会儿我们再看一下", "一点都不脱妆", "第一步先上隔离", "拍一发二可划算了",
                 "千万不要错过", "万一卡粉", "十分好用", "一二三四五", "持妆八小时", "一下子就遮住了", ""):
      self.assertEqual(normalize(text), text, text)

  def test_to_int_rejects_malformed_runs(self):
    for text in ("一二", "十十", "百二", "千万", "九十九一", "二一"):
      self.assertIsNone(to_int(text), text)
    self.assertEqual(to_int("十"), 10)
    self.assertEqual(to_int("三千五"), 3500)
    self.assertEqual(to_int("一千零一"), 1001)


if __name__ == "__main__":
  unittest.main()
