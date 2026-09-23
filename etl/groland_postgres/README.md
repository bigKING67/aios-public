# groland_postgres ETL

本目录是 AIOS 的 PostgreSQL / Prefect / DataOps 资产目录，生产运行目标是 VPS 上的 Linux + Bash。

## 当前数据架构基线

核心原则：

- 交易经营主口径只认 `ads.all_trade_overview`。
- 抖音经营总览写入 `ads.all_trade_overview` 时，GMV 使用 `ods.douyin_trade_sale_raw.trade_amount`，用户支付金额使用 `user_pay_amount`，GSV/退款率使用支付时间归因退款字段。
- 周/月纯交易报表不再维护物理汇总表，统一使用 `ads.report_all_trade_week*` / `ads.report_all_trade_month*` 视图。
- 周报专用物理表统一使用 `ads.report_*` 前缀，和看板 ADS 表分开。
- 旧 `dwd.all_trade_sale`、`dws.all_trade_sale_daily`、旧阿里妈妈 DWD/DWS/ADS 归因链路已退出 active runtime。
- SQL migration 只前进不回改；生产执行结构清理前必须先备份并停掉旧 Prefect deployment。

详见：

- `../../docs/DATA_WAREHOUSE_GUIDE.md`
- `../../docs/DATA_WAREHOUSE_CATALOG.md`
- `../../docs/REPORT_DATA_MODEL.md`
- `../../docs/DATAOPS_PIPELINE_CATALOG.md`
- `../../docs/DATA_WAREHOUSE_MIGRATION_RUNBOOK.md`
- `../../docs/DAILY_BUSINESS_BRIEF_RUNBOOK.md`

## 环境管理

推荐使用 `uv` 管理 Python 环境：

```bash
cd etl/groland_postgres
uv sync
```

常用 Prefect 命令：

```bash
uv run prefect version
uv run prefect server start
uv run prefect worker start --pool default-agent-pool
```

环境变量模板：

- `./.env.example`
- `./.env.feishu-sync.profiles.example`
- 仓库根目录 `.env.vps` / `.env.mac` 等本机私有文件不得提交。

## 云图 CDN 实时归档 helper（Mac 本地）

云图页面采集到每页短视频 CDN 后，可通过本机 helper 立即下载并归档到 TOS，同时写入
`ods.external_video_archive_raw` 和素材库 ADS 绑定表。helper 设计为跑在能访问页面 payload 的 Mac
本地，不依赖 VPS worker 读取本地 CSV。

```bash
cd etl/groland_postgres

export YUNTU_ARCHIVE_TOKEN="$(openssl rand -hex 24)"
export YUNTU_ARCHIVE_CONCURRENCY=3
# 同一 shell 还需要配置 PGHOST/PGUSER/PGPASSWORD/PGDATABASE 以及 TOS_*。
uv run python -m scripts.marketing_content_assets.yuntu_archive_server \
  --host 127.0.0.1 \
  --port 18740 \
  --token "$YUNTU_ARCHIVE_TOKEN"
```

云图页面注入 bundle 前设置同一个 token：

```js
window.YUNTU_ARCHIVE_ENABLED = true;
window.YUNTU_ARCHIVE_REQUIRED = true;
window.YUNTU_ARCHIVE_TOKEN = "同一个 YUNTU_ARCHIVE_TOKEN";
window.YUNTU_ARCHIVE_HELPER_URL = "http://127.0.0.1:18740/archive/yuntu-page-batch";
window.YUNTU_ARCHIVE_STATUS_URL = "http://127.0.0.1:18740/archive/status";
```

只做 payload 解析检查、不写库不下载：

```bash
uv run python -m scripts.marketing_content_assets.yuntu_archive \
  --payload /path/to/yuntu_payload.json \
  --mode dry-run
```

## 当前部署入口

单 flow 部署：

```bash
# 日经营总览核心底座
bash scripts/deploy_prefect_incremental_all_trade_overview.sh

# DataOps Hub 当前所有 active deployment
bash scripts/deploy_prefect_dataops_hub_all.sh

# 等价的 manifest authority 入口
python scripts/manage_prefect_deployments.py deploy active
```

`prefect-deployments.yaml` 是 active/retired、schedule、parameter、concurrency
和 watchdog SLO 的唯一清单。`deploy_prefect_dataops_hub_all.sh` 只是兼容 wrapper，
不再维护第二套 deployment 列表。

VPS 生产部署统一从仓库根目录执行：

```bash
cd /opt/docker/compose/aios
bash etl/groland_postgres/scripts/deploy_prefect_dataops_hub_all.sh
```

`deploy_prefect_dataops_hub_all.sh` 当前只部署 active 链路：

- `ads.all_trade_overview`
- 看板 ADS 日粒度/明细表
- `ads.report_*` 周报物理表
- `dwd.taobao_goods_sale_traffic`
- DataOps runtime cleanup / notification trace SLO scan

每日生意简报已纳入 active deployment inventory，但默认不创建自动 schedule，且
deployment 默认只生成 preview。迁移、测试群投递、切换唯一调度方和自然运行验收见
`../../docs/DAILY_BUSINESS_BRIEF_RUNBOOK.md`。

不再部署旧 all_trade DWD/DWS、旧周/月物理汇总、旧阿里妈妈归因链路。

## 飞书同步任务

飞书同步属于 DataOps 下游分发，不参与本仓 ETL 入库口径。

```bash
# Mac 开发机连接 VPS 数据库
bash scripts/run_feishu_sync.sh --env-file .env.mac

# VPS 宿主机定时同步
bash scripts/run_feishu_sync_scheduler.sh --env-file .env.vps-host
```

说明文档：`../../docs/DATAOPS_FEISHU_SYNC.md`。

## 验证命令

脚本语法：

```bash
find scripts -maxdepth 1 -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n
```

Python 编译：

```bash
python3 -m py_compile scripts/prefect_incremental_all_trade_overview.py
```

周报/overview 链路检查：

```bash
bash ../../scripts/dataops/check-weekly-etl-chain.sh
```

SQL 检查文件位于：

```text
tests/sql/
```

一次性 PostgreSQL control-plane E2E（不会执行业务 flow）：

```bash
npm run test:prefect:control-plane:postgres
```

每日生意简报账本 migration/约束 E2E（一次性 PostgreSQL，不访问 webhook）：

```bash
npm run test:daily-business-brief:postgres
```

重点检查：

- `all_trade_overview_check.sql`
- `report_all_trade_week_consistency_check.sql`
- `report_all_trade_week_platform_consistency_check.sql`
- `report_all_trade_month_consistency_check.sql`
- `report_all_trade_month_platform_consistency_check.sql`
- `report_physical_tables_unique_key_check.sql`

## systemd 常驻

PostgreSQL control-plane 的完整 shadow/cutover/rollback/soak 流程见：

- `../../docs/PREFECT_POSTGRES_CONTROL_PLANE_RUNBOOK.md`

先在 clean `main` checkout 创建非登录 service user 与版本化、root-owned runtime：

```bash
cd /opt/docker/compose/aios
sudo bash etl/groland_postgres/scripts/install_prefect_runtime.sh
```

再安装非 root Server/Worker、journald、watchdog、daily backup 和 weekly restore
verification units。`PREFECT_DB_PASSWORD` 与
`PREFECT_BACKUP_RESTORE_ADMIN_URL` 必须只放在 root-only operations env，不得放入
Server/Worker 会读取的 `.env.vps`：

```bash
cd /opt/docker/compose/aios
set -a
source .env.vps
set +a

ENV_FILE=/opt/docker/compose/aios/.env.vps \
PROJECT_ROOT=/opt/docker/compose/aios/etl/groland_postgres \
PREFECT_OPERATIONS_ENV_FILE=/etc/aios/prefect-control-plane-operations.env \
HOST_ADDRESS=127.0.0.1 \
PORT=4200 \
POOL_NAME=default-agent-pool \
SYSTEMD_USER=aios-prefect \
SYSTEMD_GROUP=aios-prefect \
SERVICE_PREFIX=aios-prefect \
ENABLE_ON_BOOT=1 \
START_NOW=1 \
bash etl/groland_postgres/scripts/install_prefect_systemd.sh
```

常用排查：

```bash
systemctl status aios-prefect-server --no-pager
systemctl status aios-prefect-worker --no-pager
journalctl -u aios-prefect-server -f
journalctl -u aios-prefect-worker -f
systemctl list-timers 'aios-prefect-*' --all
```
