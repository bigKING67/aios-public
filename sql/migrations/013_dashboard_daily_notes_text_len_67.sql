BEGIN;

ALTER TABLE public.dashboard_daily_notes
  DROP CONSTRAINT IF EXISTS dashboard_daily_notes_action_text_check,
  DROP CONSTRAINT IF EXISTS dashboard_daily_notes_reason_text_check,
  DROP CONSTRAINT IF EXISTS dashboard_daily_notes_summary_text_check;

ALTER TABLE public.dashboard_daily_notes
  ADD CONSTRAINT dashboard_daily_notes_action_text_check
    CHECK (char_length(action_text) BETWEEN 1 AND 67),
  ADD CONSTRAINT dashboard_daily_notes_reason_text_check
    CHECK (char_length(reason_text) BETWEEN 1 AND 67),
  ADD CONSTRAINT dashboard_daily_notes_summary_text_check
    CHECK (char_length(summary_text) BETWEEN 1 AND 67);

COMMIT;
