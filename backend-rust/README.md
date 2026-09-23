# AIOS Rust Backend (Axum + SQLx + Dragonfly)

这是 AIOS 的 Rust 后端迁移里程碑版本，目标是与现有前端接口保持兼容，并替换为：

- Web 框架：`axum`
- 数据库：`PostgreSQL`（`sqlx`）
- 缓存 / 限流：`Dragonfly`（RESP 协议兼容）

## 已覆盖接口

- 健康检查：`GET /health`
- 认证：
  - `POST /v1/auth/login`
  - `POST /v1/auth/register`
  - `POST /v1/auth/refresh`
  - `POST /v1/auth/logout`
  - `GET /v1/auth/me`
  - `POST /v1/auth/change-password`
- 用户管理：
  - `GET /v1/users`
  - `POST /v1/users`
  - `PUT /v1/users/{user_id}`
  - `DELETE /v1/users/{user_id}`
- 角色管理：
  - `GET /v1/roles`
  - `POST /v1/roles`
  - `GET /v1/roles/{role_id}`
  - `PUT /v1/roles/{role_id}`
  - `DELETE /v1/roles/{role_id}`
  - `PUT /v1/roles/{role_id}/permissions`
- 权限管理：
  - `GET /v1/permissions`（支持 `grouped=true|false`）
- 审计日志：
  - `GET /v1/audit-logs`
- 周报：
  - `GET /v1/reports/weekly/by-period`
  - `GET /v1/reports/weekly/latest-period`
  - `GET /v1/reports/weekly/all-periods`
  - `GET /v1/reports/weekly/{report_id}/meta`
  - `GET /v1/reports/weekly/{report_id}`
- 周报总结：
  - `POST /v1/reports/weekly/{report_id}/generate-summary`
  - `GET /v1/reports/weekly/{report_id}/summary-status`
  - `GET /v1/reports/weekly/{report_id}/summary`
  - `PUT /v1/reports/weekly/{report_id}/summary`（手工编辑保存）
- 月报：
  - `GET /v1/reports/monthly/by-period`
  - `GET /v1/reports/monthly/latest-period`
  - `GET /v1/reports/monthly/all-periods`
  - `GET /v1/reports/monthly/{month_period}/meta`
  - `GET /v1/reports/monthly/{month_period}`

## 快速启动

1. 准备配置

```bash
cd backend-rust
cp .env.example .env
# 填写 DATABASE_URL / SECRET_KEY / KIMI_API_KEY 或 DEEPSEEK_API_KEY
```

2. 启动 Dragonfly

```bash
docker compose -f ../docker-compose.dragonfly.yml up -d
```

3. 启动 Rust 后端

```bash
cargo run --bin aios-backend-rust
```

默认监听：`http://localhost:8000`

只读诊断可显式使用 `AIOS_RUNTIME_READ_ONLY=true`：允许
`GET/HEAD/OPTIONS`，以及精确的 V1/V2 `POST /auth/session/refresh`。该 refresh
仅校验现有 refresh token 并更新短期 access cookie，不轮换、撤销或写入 refresh
token；登录、登出、旧版 refresh 和业务写接口仍返回 `503`。数据库连接强制
`default_transaction_read_only=on`，并跳过 schema compatibility 与后台预热/清理
任务。默认 `false`，不改变正常运行行为。完全退出登录后仍需在正常、已授权的环境
建立会话，不能用只读模式创建新会话。

关键性能参数（可按环境覆盖）：

- `DB_MAX_CONNECTIONS=30`
- `DB_MIN_CONNECTIONS=0`
- `DB_ACQUIRE_TIMEOUT_SECONDS=20`
- `DB_TEST_BEFORE_ACQUIRE=true`（默认在 checkout 前校验连接，避免中间层静默断开后的 stale connection 直接进入请求链路；若部署环境确认稳定且性能优先，可显式设为 `false`）
- `WEEKLY_REPORT_CACHE_TTL_SECONDS=900`
- `MONTHLY_REPORT_CACHE_TTL_SECONDS=900`
- `WEEKLY_PERIOD_CACHE_TTL_SECONDS=60`
- `MONTHLY_PERIOD_CACHE_TTL_SECONDS=60`
- `REPORT_BUILD_CONCURRENCY=8`（缓存 miss 重建并发闸门）
- `REPORT_WARMUP_WEEKLY_PERIOD_LIMIT=200`
- `REPORT_WARMUP_MONTHLY_PERIOD_LIMIT=200`
- `REPORT_WARMUP_PARALLELISM=6`
- `REPORT_WARMUP_INTERVAL_SECONDS=300`（周期性后台预热，`0` 表示只启动时预热一次）
- `LLM_DEFAULT_PROVIDER=deepseek`（周报总结默认模型供应商）
- `DEEPSEEK_MODEL=deepseek-reasoner`
- `LLM_REASONER_TIMEOUT_SECONDS=660`（推理模型专用超时，覆盖高峰排队+思考时延）
- `LLM_TEMPERATURE=1.0`

上线建议（灰度）：

1. 先在灰度环境开启上述参数并完成 `T+0 / T+15m / T+30m` 三轮压测。
2. 若三轮均满足 `fail_rate=0` 且 `p99 < 300ms`，再全量放开。

## 与前端联调

前端无需改动代理规则，保持：

- `VITE_API_URL=http://localhost:8000/v1`

即可直接访问 Rust 后端。

## 说明

- 周报总结采用 Rust 进程内异步任务（Tokio）。
- Dragonfly 用于限流与轻量状态缓存。
- 为兼容历史环境，认证查询支持多套用户/权限表结构（`auth_*` / `users` / `ods_aios_*`）。
- 服务启动后会自动预热报表缓存（默认最多 200 周 + 200 月，可配置）。
- 默认每 10 分钟执行一次后台预热，避免长时间空闲后首波并发触发冷缓存雪崩。
- 周/月明细缓存支持 `stale-while-revalidate`：接近过期时后台刷新，不阻塞当前请求。
- `/all-periods` 使用“全量缓存 + 本地 limit 截断”，避免按 limit 形成缓存碎片。
- 缓存写入带 TTL 抖动（jitter），避免同一时刻批量过期导致尾延迟尖刺。
- `DATABASE_URL` 兼容 `postgresql://` 与 `postgresql+asyncpg://` 写法。

## 并发压测（时间筛选）

项目内置了 `k6` 脚本，针对你最关心的时间筛选高并发场景：

- `GET /v1/reports/weekly/by-period`
- `GET /v1/reports/monthly/by-period`
- `GET /v1/reports/weekly/all-periods`
- `GET /v1/reports/monthly/all-periods`

脚本位置：`backend-rust/scripts/k6_reports_time_filter.js`

```bash
# 需先安装 k6，并准备一个可访问报表接口的 token
export BASE_URL="http://localhost:8000"
export AUTH_TOKEN="<your-jwt-token>"

# 可按需调整压力参数
export DETAIL_RATE=60
export PERIOD_RATE=20
export TEST_DURATION=2m

k6 run backend-rust/scripts/k6_reports_time_filter.js
```

可选参数：

- `DETAIL_PRE_VUS` / `DETAIL_MAX_VUS`
- `PERIOD_PRE_VUS` / `PERIOD_MAX_VUS`
- `K6_TIMEOUT`

## 周报总结 AI 配置

周报总结支持传入以下参数（`POST /v1/reports/weekly/{report_id}/generate-summary`）：

- `business_framework`：分析框架
- `custom_prompt`：补充提示词
- `facts_data`：背景事实 JSON
- `provider`：`deepseek` / `kimi`
- `model`：模型名

后端提示词模板入口：

- `backend-rust/src/reports/summary_prompt.rs` 中 `build_summary_prompt(...)`

前端默认配置入口：

- `apps/web-vite/src/config/weekly-summary-ai.ts`

压测结果可导出并自动判定达标：

```bash
SUMMARY_FILE="/tmp/reports-time-filter-summary.json"

k6 run \
  --summary-export "$SUMMARY_FILE" \
  backend-rust/scripts/k6_reports_time_filter.js

node backend-rust/scripts/evaluate_k6_summary.js "$SUMMARY_FILE"
```

当前 report 数据模型与上线迁移原则见：

- `docs/REPORT_DATA_MODEL.md`
- `docs/DATA_WAREHOUSE_MIGRATION_RUNBOOK.md`

如果本机没有 `k6`，可用 Python 标准库版压测脚本：

```bash
python3 backend-rust/scripts/loadtest_reports_time_filter.py \
  --base-url http://localhost:8000 \
  --duration 60 \
  --detail-rate 30 \
  --period-rate 10 \
  --workers 50
```
