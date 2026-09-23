BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboard_daily_notes (
  id BIGSERIAL PRIMARY KEY,
  note_date DATE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('taobao', 'douyin', 'xhs', 'jd', 'wx')),
  metric_key TEXT,
  action_text TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (char_length(action_text) BETWEEN 1 AND 20),
  CHECK (char_length(reason_text) BETWEEN 1 AND 30),
  CHECK (char_length(summary_text) BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_daily_notes_platform_date_active
  ON public.dashboard_daily_notes (platform, note_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dashboard_daily_notes_date_active
  ON public.dashboard_daily_notes (note_date DESC)
  WHERE deleted_at IS NULL;

COMMIT;
