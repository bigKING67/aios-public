# feishu_sync

该目录承载 DataOps 飞书同步任务代码（PostgreSQL -> Feishu Bitable）。

## 目录结构

```text
feishu_sync/
└── feishu_data_hub/
    ├── infra/
    │   ├── api/
    │   ├── config/
    │   └── utils/
    ├── sync/
        ├── main.py
        ├── scheduler.py
        └── services/
    └── cli.py
```

## 运行方式

请优先使用 `etl/groland_postgres/scripts` 下的统一入口：

- `run_feishu_sync.sh`
- `run_feishu_sync_scheduler.sh`

详细环境变量与操作说明见：`docs/DATAOPS_FEISHU_SYNC.md`。
