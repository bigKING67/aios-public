-- ============================================================================
-- Migration 005: Weekly Summary AI Generation Table
-- ============================================================================
-- Created: 2026-02-26
-- Purpose: AI 生成周报总结的持久化存储表
-- Description:
-- 1. 新增 ads.report_weekly_summary 持久化表，支持 AI 总结的生成、存储和查询
-- 2. 支持异步任务状态管理（PENDING → GENERATING → SUCCESS/FAILED）
-- 3. 保存 Prompt 快照和事实数据快照，便于追踪和审计
-- 4. 支持自动重试追踪，记录每次生成的尝试次数

CREATE TABLE IF NOT EXISTS ads.report_weekly_summary (
    -- 主键和基础信息
    id BIGSERIAL PRIMARY KEY,
    week_period VARCHAR(64) NOT NULL UNIQUE,

    -- 生成结果（只有 SUCCESS 时有值）
    summary_text TEXT,

    -- 任务状态管理
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    generated_at TIMESTAMPTZ,
    error_msg TEXT,

    -- 异步任务追踪
    task_id VARCHAR(64) UNIQUE,

    -- LLM 提供商信息
    provider VARCHAR(32),
    model VARCHAR(64),

    -- 快照数据（用于追踪和审计）
    prompt_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    facts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- 重试追踪
    attempt_count INT NOT NULL DEFAULT 0,

    -- 审计字段
    requested_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 约束条件
    CONSTRAINT ck_report_weekly_summary_status
        CHECK (status IN ('PENDING', 'GENERATING', 'SUCCESS', 'FAILED')),
    CONSTRAINT ck_report_weekly_summary_attempt_count
        CHECK (attempt_count >= 0)
);

-- ============================================================================
-- 索引优化
-- ============================================================================

-- 查询待处理和生成中的任务，按更新时间倒序
CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_status_updated
ON ads.report_weekly_summary (status, updated_at DESC)
WHERE status IN ('PENDING', 'GENERATING');

-- 查询最近生成的总结，用于列表展示
CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_generated_at
ON ads.report_weekly_summary (generated_at DESC)
WHERE status = 'SUCCESS';

-- 快速查询任务 ID，用于幂等性校验和防重
CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_task_id
ON ads.report_weekly_summary (task_id)
WHERE task_id IS NOT NULL;

-- 快速查询某个周期是否已生成
CREATE INDEX IF NOT EXISTS idx_report_weekly_summary_week_period
ON ads.report_weekly_summary (week_period);

-- ============================================================================
-- 表和列的中文备注
-- ============================================================================

COMMENT ON TABLE ads.report_weekly_summary IS
'周报 AI 总结生成任务表 - 用于存储 AI 生成的周报总结、任务状态、错误信息等';

-- 主键和基础信息
COMMENT ON COLUMN ads.report_weekly_summary.id IS
'主键 - 自增长唯一标识';

COMMENT ON COLUMN ads.report_weekly_summary.week_period IS
'周期标识（唯一性约束） - 格式示例：2025/2/7~2025/2/13，一个周期只能有一条记录，防止重复生成';

-- 生成结果
COMMENT ON COLUMN ads.report_weekly_summary.summary_text IS
'AI 生成的总结内容 - JSON 格式字符串，包含 overall（总体概况）、highlights（亮点）、risks（风险）三个字段，仅 SUCCESS 状态时有值';

-- 任务状态管理
COMMENT ON COLUMN ads.report_weekly_summary.status IS
'任务状态（CHECK 约束） - PENDING: 待处理，GENERATING: 生成中，SUCCESS: 成功，FAILED: 失败。状态流转：PENDING → GENERATING → SUCCESS 或 FAILED';

COMMENT ON COLUMN ads.report_weekly_summary.generated_at IS
'成功生成的时间戳 - 记录 AI 首次成功生成总结的时间，仅 SUCCESS 状态时有值';

COMMENT ON COLUMN ads.report_weekly_summary.error_msg IS
'错误信息 - 任务失败时记录错误原因，如"API 超时"、"认证失败"等，帮助调试和监控';

-- 异步任务追踪
COMMENT ON COLUMN ads.report_weekly_summary.task_id IS
'异步任务 ID（唯一性约束） - 用于追踪生成任务执行状态，同一周期重新生成会产生新的 task_id';

-- LLM 提供商信息
COMMENT ON COLUMN ads.report_weekly_summary.provider IS
'LLM 提供商 - 取值：kimi、deepseek，记录本次生成所使用的 AI 服务商';

COMMENT ON COLUMN ads.report_weekly_summary.model IS
'模型名称 - 如"moonshot-v1-128k"（Kimi）、"deepseek-chat"（DeepSeek），便于追踪不同模型的生成效果';

-- 快照数据（用于追踪和审计）
COMMENT ON COLUMN ads.report_weekly_summary.prompt_config IS
'Prompt 配置快照 - JSON 格式，包含 system_prompt（系统提示词）、business_framework（业务框架）、custom_prompt（自定义提示词）等，用于追踪生成过程中使用的提示词配置';

COMMENT ON COLUMN ads.report_weekly_summary.facts_snapshot IS
'事实数据快照 - JSON 格式，包含生成时使用的所有数据（KPI、平台 GMV 等），用于审计和重现生成结果';

-- 重试追踪
COMMENT ON COLUMN ads.report_weekly_summary.attempt_count IS
'生成尝试次数 - 记录失败重试的累计次数（初始值 0），最多重试 3 次（attempt_count 最高为 3）';

-- 审计字段
COMMENT ON COLUMN ads.report_weekly_summary.requested_by IS
'触发用户 - 记录哪个用户点击"生成本周总结"按钮，用于审计和溯源';

COMMENT ON COLUMN ads.report_weekly_summary.created_at IS
'创建时间 - 记录任务首次创建的时间戳，用于追踪数据生命周期';

COMMENT ON COLUMN ads.report_weekly_summary.updated_at IS
'更新时间 - 记录任务最后一次修改的时间戳（每次状态变化都会更新），用于查询最近修改的任务';
