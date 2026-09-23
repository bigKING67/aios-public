from __future__ import annotations

import sys
from pathlib import Path


CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
  sys.path.append(str(CURRENT_DIR))

from marketing_content_assets.qianchuan_reports import main  # noqa: E402


if __name__ == "__main__":
  raise SystemExit(main())
