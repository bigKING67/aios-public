-- ============================================================================
-- Migration 004: 性能快赢索引（Phase 1 / Phase 2）
-- ============================================================================
-- Created: 2026-02-25
-- Description:
-- 1. 看板 ACL 热路径复合索引
-- 2. 旧周/月物理报表索引已随 report_* 视图化治理移除；
--    report 周/月口径统一由 ads.all_trade_overview 的 date/platform 索引承载。

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dashboard_sharing_user_dashboard_expires
ON dashboard_sharing (shared_with_user_id, dashboard_id, expires_at);
