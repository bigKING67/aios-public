COMMENT ON COLUMN ads.report_weekly_summary.summary_scope IS
  '周报总结范围，取值为 global、overview 或 tmall。';
COMMENT ON COLUMN ads.report_weekly_summary.summary_content_status IS
  '总结内容状态，取值为 AI_DRAFT、MANUAL_EDITED、APPROVED 或 PUBLISHED。';
COMMENT ON COLUMN ads.report_weekly_summary.summary_updated_by IS
  '最近手动更新总结内容的用户标识。';
COMMENT ON COLUMN ads.report_weekly_summary.summary_approved_by IS
  '审批通过总结内容的用户标识。';
COMMENT ON COLUMN ads.report_weekly_summary.summary_approved_at IS
  '总结内容审批通过时间。';
COMMENT ON COLUMN ads.report_weekly_summary.summary_published_by IS
  '发布总结内容的用户标识。';
COMMENT ON COLUMN ads.report_weekly_summary.summary_published_at IS
  '总结内容发布时间。';
