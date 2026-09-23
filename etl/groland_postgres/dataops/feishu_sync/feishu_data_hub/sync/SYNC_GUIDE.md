# 数据同步模块指南

## 核心流程

```
1. 获取数据库数据（增量/全量）
2. 获取飞书多维表数据
3. 按主键匹配，生成同步计划（更新/新增/删除）
4. 执行同步操作
5. 更新水位（增量模式）
```

## 关键配置

### 字段映射 (`infra/config/loader.py`)

```python
'douyin_trade_sale_card': {
    'date': '日期',           # DB字段 -> 飞书字段名
    'shop_name': '店铺名称',
    ...
}
```

**重要**: 飞书字段名必须与飞书表中的字段名完全一致，通常参照数据库DDL的comment命名。

### 主键配置 (`.env`)

```
PG_PK_DOUYIN_TRADE_SALE=shop_name,shop_id,stat_date
PG_PK_DOUYIN_TRADE_SALE_LIVE=shop_name,shop_id,anchor_douyin_id,live_start_time
PG_PK_DOUYIN_TRADE_SALE_CARD=shop_name,shop_id,date,product_id
```

## 常见问题与解决

### 1. 重复记录问题

**症状**: 同步显示"新增 N 条"，但实际应该是更新

**原因**: 主键匹配失败，通常是日期格式不一致
- 数据库 `datetime.date` -> `"2026-01-08"`
- 飞书时间戳 -> `"2026-01-08 00:00:00"` (错误)

**解决**: `base_sync.py` 的 `_normalize_pk_value` 方法已修复，确保日期统一返回 `YYYY-MM-DD` 格式

### 2. 字段值为空

**症状**: 数据库有值，但飞书显示空

**原因**:
1. 字段映射不完整（缺少该字段的映射）
2. 字段名不匹配（飞书字段名与映射配置不一致）

**解决**:
1. 检查 `loader.py` 中的 `_get_field_mappings()` 是否包含该字段
2. 确认飞书字段名与映射值完全一致（包括括号、空格等）

### 3. 过滤掉 N 条缺少主键字段的记录

**症状**: 日志显示 "过滤掉 X 条缺少主键字段的记录"

**原因**: 飞书记录中缺少主键字段（如"日期"字段为空）

**解决**:
1. 检查字段映射中主键字段的飞书名称是否正确
2. 如果是历史数据问题，删除飞书中的问题记录，重置水位后重新同步

### 4. 增量同步不生效

**症状**: 数据库有新数据，但同步显示 0 条

**原因**: 水位已是最新，增量查询无新数据

**解决**: 重置水位强制全量同步

```python
from feishu_data_hub.infra.api.postgres_api import PostgresAPI
pg = PostgresAPI()
pg.execute("DELETE FROM sync_state WHERE service_name = 'ods.表名'")
```

## 水位管理

水位存储在 `sync_state` 表：

| 字段 | 说明 |
|------|------|
| service_name | 表名（如 `ods.douyin_trade_sale_card_raw`） |
| last_watermark | 最后同步的 updated_at 值 |
| last_primary_key | 最后同步记录的主键值 |

### 查看当前水位

```sql
SELECT * FROM sync_state;
```

### 重置水位

```sql
-- 重置单个表
DELETE FROM sync_state WHERE service_name = 'ods.douyin_trade_sale_card_raw';

-- 重置所有表
DELETE FROM sync_state;
```

## 新增业务表步骤

1. **添加字段映射** (`infra/config/loader.py`)
   - 在 `_get_field_mappings()` 中添加新表的映射
   - 字段名参照DDL的comment

2. **添加环境变量** (`.env`)
   ```
   FEISHU_TABLE_NEW_TABLE=tblXXX
   PG_TABLE_NEW_TABLE=ods.new_table_raw
   PG_PK_NEW_TABLE=pk_field1,pk_field2
   PG_WM_NEW_TABLE=updated_at
   ```

3. **创建同步服务** (`sync/services/new_table_sync.py`)
   ```python
   from feishu_data_hub.sync.services.base_sync import SyncService
   from feishu_data_hub.infra.config import get_feishu_config, get_postgres_config

   class NewTableSyncService(SyncService):
       def __init__(self):
           feishu_config = get_feishu_config()
           pg_config = get_postgres_config()
           super().__init__(
               '新表同步服务',
               feishu_config['bitable']['tables']['new_table'],
               feishu_config['bitable']['field_mapping']['new_table'],
               pg_config['tables']['new_table']
           )
   ```

4. **注册到主程序** (`sync/main.py`)

## 调试技巧

### 查看同步详情

设置日志级别为 DEBUG 可查看字段比较详情：

```python
import logging
logging.getLogger().setLevel(logging.DEBUG)
```

### 手动测试字段映射

```python
from feishu_data_hub.infra.api.feishu_api import FeishuAPI
from feishu_data_hub.infra.config import get_feishu_config

feishu = FeishuAPI()
config = get_feishu_config()

# 获取飞书表字段
table_id = config['bitable']['tables']['douyin_trade_sale_card']
fields = feishu.get_table_fields(table_id)
for f in fields:
    print(f['field_name'])
```

### 对比数据库与飞书数据

```python
from feishu_data_hub.infra.api.postgres_api import PostgresAPI

pg = PostgresAPI()
result = pg.query("SELECT * FROM ods.表名 LIMIT 5")
for row in result:
    print(row)
```
