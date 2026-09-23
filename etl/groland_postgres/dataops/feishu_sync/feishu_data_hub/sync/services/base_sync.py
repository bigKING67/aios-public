"""同步服务基础模块"""
from typing import List, Dict, Any, Tuple, Optional
import time
import datetime
from decimal import Decimal

from feishu_data_hub.infra.api import FeishuAPI, PostgresAPI

from feishu_data_hub.infra.utils import get_logger
from feishu_data_hub.infra.utils.exceptions import SyncException


class SyncService:
    """同步服务基类"""

    # 批量处理大小常量
    BATCH_SIZE = 1000  # 飞书API支持最大1000条/次
    DELETE_BATCH_SIZE = 500  # 飞书API删除限制为500条/次
    READ_PAGE_SIZE = 500  # 飞书API读取最大500条/页
    RATE_LIMIT_DELAY = 0.8  # API调用间隔（秒）

    # PostgreSQL类型到飞书字段类型的映射
    PG_TO_FEISHU_TYPE = {
        # 数字类型 -> 2 (数字)
        'integer': 2, 'bigint': 2, 'smallint': 2, 'serial': 2, 'bigserial': 2,
        'numeric': 2, 'decimal': 2, 'real': 2, 'double precision': 2,
        # 日期时间类型 -> 5 (日期)
        'timestamp without time zone': 5, 'timestamp with time zone': 5,
        'date': 5, 'time without time zone': 1, 'time with time zone': 1,
        # 布尔类型 -> 7 (复选框)
        'boolean': 7,
        # 文本类型 -> 1 (文本)
        'character varying': 1, 'varchar': 1, 'text': 1, 'char': 1, 'character': 1,
    }

    def __init__(
        self,
        service_name: str,
        table_id: str,
        field_mapping: Dict[str, str],
        db_table: Dict[str, Any]
    ):
        """
        初始化同步服务

        Args:
            service_name: 服务名称
            table_id: 飞书表ID
            field_mapping: 字段映射字典
            db_table: 数据库表配置字典，包含name、primary_key、watermark_column
        """
        self.logger = get_logger(service_name)
        self.service_name = service_name
        self.table_id = table_id
        self.field_mapping = field_mapping

        # 从配置字典中提取表信息
        self.db_table = db_table['name']
        self.db_primary_key = db_table.get('primary_key', 'id')
        self.db_watermark_column = db_table.get('watermark_column')
        self.sync_state_key = self.db_table  # 使用表名作为同步状态的key

        self.feishu_api = FeishuAPI()
        self.db_api = PostgresAPI()

    def _get_pk_value(self, record: Dict[str, Any]) -> Any:
        """
        从记录中提取主键值（支持复合主键）

        Args:
            record: 数据记录

        Returns:
            主键值（单值或元组）
        """
        if isinstance(self.db_primary_key, list):
            return tuple(record[k] for k in self.db_primary_key)
        return record[self.db_primary_key]

    def _normalize_pk_value(self, value: Any) -> str:
        """
        将主键值统一转换为字符串格式（解决日期/时间字段格式不一致问题）

        Args:
            value: 主键字段值

        Returns:
            统一格式的字符串
        """
        if value is None:
            return ''

        # datetime.datetime 保留完整时间（精确到秒）
        if isinstance(value, datetime.datetime):
            return value.strftime('%Y-%m-%d %H:%M:%S')

        # datetime.date 只返回日期
        if isinstance(value, datetime.date):
            return value.isoformat()

        # 飞书返回的毫秒时间戳（大于 10^11 的数字）
        # 如果时间部分为 00:00:00，只返回日期（与 datetime.date 保持一致）
        if isinstance(value, (int, float)) and value > 1e11:
            try:
                dt = datetime.datetime.fromtimestamp(value / 1000)
                if dt.hour == 0 and dt.minute == 0 and dt.second == 0:
                    return dt.strftime('%Y-%m-%d')
                return dt.strftime('%Y-%m-%d %H:%M:%S')
            except (ValueError, OSError):
                pass

        return str(value)

    def _get_pk_str(self, record: Dict[str, Any]) -> str:
        """
        从记录中提取主键的字符串表示（用于映射表的key）

        Args:
            record: 数据记录

        Returns:
            主键字符串
        """
        if isinstance(self.db_primary_key, list):
            return '|'.join(self._normalize_pk_value(record[k]) for k in self.db_primary_key)
        return self._normalize_pk_value(record[self.db_primary_key])

    def _build_bitable_key_set(self, bitable_data: List[Dict[str, Any]]) -> set:
        """
        构建飞书记录的主键集合（用于快速查找）

        Args:
            bitable_data: 飞书多维表数据列表

        Returns:
            主键字符串集合
        """
        keys = set()
        if isinstance(self.db_primary_key, list):
            bitable_pk_fields = [self.field_mapping.get(k) for k in self.db_primary_key]
            if not all(bitable_pk_fields):
                return keys
            for item in bitable_data:
                fields = item.get('fields', {})
                if all(f in fields for f in bitable_pk_fields):
                    key = '|'.join(self._normalize_pk_value(fields.get(f, '')) for f in bitable_pk_fields)
                    keys.add(key)
        else:
            bitable_id_field = self.field_mapping.get(self.db_primary_key)
            if not bitable_id_field:
                return keys
            for item in bitable_data:
                fields = item.get('fields', {})
                if bitable_id_field in fields:
                    keys.add(self._normalize_pk_value(fields[bitable_id_field]))
        return keys

    def _ensure_bitable_fields(self) -> None:
        """
        检查并自动创建缺失的飞书多维表字段（根据数据库字段类型设置飞书字段类型）
        """
        # 获取飞书表现有字段
        existing_fields = self.feishu_api.get_table_fields(self.table_id)
        existing_names = {f['field_name'] for f in existing_fields}

        # 检查 field_mapping 中的字段是否存在，记录缺失的字段及其数据库字段名
        missing_fields = []  # [(db_field, bitable_field), ...]
        for db_field, bitable_field in self.field_mapping.items():
            if bitable_field not in existing_names:
                missing_fields.append((db_field, bitable_field))

        if not missing_fields:
            self.logger.debug("所有字段已存在，无需创建")
            return

        self.logger.info(f"检测到 {len(missing_fields)} 个缺失字段，开始自动创建...")

        # 获取数据库字段类型
        column_types = self.db_api.get_column_types(self.db_table)

        # 创建缺失字段（根据数据库类型设置飞书字段类型）
        for db_field, bitable_field in missing_fields:
            pg_type = column_types.get(db_field, '')
            feishu_type = self.PG_TO_FEISHU_TYPE.get(pg_type, 1)  # 默认文本类型
            try:
                self.feishu_api.create_field(self.table_id, bitable_field, field_type=feishu_type)
            except Exception as e:
                self.logger.warning(f"创建字段 '{bitable_field}' 失败: {e}")

        self.logger.info(f"字段创建完成")

    def sync(self) -> Dict[str, Any]:
        """
        执行全量同步

        Returns:
            包含更新、新增、删除数量及记录详情的字典

        Raises:
            SyncException: 同步失败时抛出
        """
        self.logger.info(f"开始同步 {self.db_table} 到多维表...")

        try:
            # 0. 检查并创建缺失的飞书字段
            self._ensure_bitable_fields()

            # 1. 获取数据库数据（增量或全量）
            db_data, latest_state = self.fetch_db_records()
            sync_mode = '增量' if self.db_watermark_column else '全量'
            self.logger.info(
                f"从数据库获取了 {len(db_data)} 条记录 ({sync_mode}模式)"
            )

            # 优化：增量模式下无新数据直接返回
            if self.db_watermark_column and not db_data:
                self.logger.info("增量模式下无新数据，跳过后续步骤")
                return {'updated': 0, 'added': 0, 'deleted': 0, 'added_records': [], 'updated_records': []}

            # 2. 获取多维表数据（增量模式下使用目标精确查询优化）
            is_incremental = self.db_watermark_column is not None
            if is_incremental and 0 < len(db_data) <= 50:
                self.logger.info(f"检测到少量增量数据({len(db_data)}条)，使用目标精确查询")
                bitable_data = self._fetch_targeted_bitable_data(db_data)
            else:
                bitable_data = self.fetch_all_bitable_data()
            self.logger.info(f"从多维表获取了 {len(bitable_data)} 条记录")

            # 3. 生成同步计划
            # 注意：增量模式下不处理删除，避免误删未变更的记录
            to_update, to_add, to_delete = self.generate_sync_plan(
                db_data,
                bitable_data,
                skip_delete=is_incremental
            )
            if is_incremental:
                self.logger.info(f"计划 (增量): 更新 {len(to_update)} 条, 新增 {len(to_add)} 条 [删除已禁用]")
            else:
                self.logger.info(f"计划 (全量): 更新 {len(to_update)} 条, 新增 {len(to_add)} 条, 删除 {len(to_delete)} 条")

            # 提取原始记录用于通知（在转换前）
            # 预计算 bitable 主键集合，避免 O(N*M) 复杂度
            bitable_keys = self._build_bitable_key_set(bitable_data)
            added_records = []
            updated_records = []
            for item in db_data:
                key = self._get_pk_str(item)
                if key in bitable_keys:
                    if len(updated_records) < 10:
                        updated_records.append(item)
                else:
                    if len(added_records) < 10:
                        added_records.append(item)
                # 两个列表都满了就提前退出
                if len(added_records) >= 10 and len(updated_records) >= 10:
                    break

            # 4. 执行同步操作
            self.execute_sync_operations(to_update, to_add, to_delete)

            # 5. 更新同步水位（仅增量模式且有新数据）
            if self.db_watermark_column and latest_state is not None:
                latest_wm, latest_pk = latest_state
                if latest_wm is not None and latest_pk is not None:
                    # 复合主键转为字符串存储
                    pk_str = '|'.join(str(v) for v in latest_pk) if isinstance(latest_pk, tuple) else str(latest_pk)
                    self.db_api.upsert_sync_state(
                        self.sync_state_key,
                        latest_wm,
                        pk_str
                    )
                    pk_display = self.db_primary_key if isinstance(self.db_primary_key, list) else [self.db_primary_key]
                    self.logger.info(
                        f"更新同步水位: {self.db_watermark_column}={latest_wm}, "
                        f"{pk_display}={latest_pk}"
                    )

            self.logger.info(f"同步 {self.db_table} 完成")
            return {
                'updated': len(to_update),
                'added': len(to_add),
                'deleted': len(to_delete),
                'added_records': added_records,
                'updated_records': updated_records
            }

        except Exception as e:
            self.logger.error(f"同步失败: {e}", exc_info=True)
            raise SyncException(f"同步 {self.db_table} 失败: {e}") from e

    def fetch_db_records(self) -> Tuple[List[Dict[str, Any]], Optional[Tuple[Any, Any]]]:
        """
        根据配置决定使用全量或增量方式获取数据库数据

        Returns:
            (数据列表, 最新watermark值)的元组
            - 全量模式：watermark为None
            - 增量模式：watermark为最新的水位值
        """
        # 未配置watermark，使用全量模式
        if not self.db_watermark_column:
            data = self._fetch_full_table()
            return data, None

        # 尝试获取上次同步水位
        state = self.db_api.get_sync_state(self.sync_state_key)
        if not state or state.get('last_watermark') is None:
            self.logger.info("未发现同步水位，执行全量同步并初始化水位")
            data = self._fetch_full_table()
            latest_watermark, latest_pk = self._extract_latest_state(data)
            return data, (latest_watermark, latest_pk)

        # 执行增量同步
        last_watermark = state['last_watermark']
        last_pk = state.get('last_primary_key')
        self.logger.info(f"使用水位 {last_watermark} (pk={last_pk}) 执行增量同步")
        return self._fetch_incremental(last_watermark, last_pk)

    def _fetch_full_table(self) -> List[Dict[str, Any]]:
        """
        使用 Keyset 分页拉取全量数据（性能优于 OFFSET）

        Returns:
            全量数据列表
        """
        all_data = []
        last_pk = None

        while True:
            batch = self.db_api.get_table_data_keyset(
                self.db_table,
                self.db_primary_key,
                last_pk,
                self.BATCH_SIZE
            )
            if not batch:
                break

            all_data.extend(batch)
            last_pk = self._get_pk_value(batch[-1])
            self.logger.debug(f"全量拉取批次 {len(batch)} 条，累计 {len(all_data)}")

        return all_data

    def _fetch_incremental(
        self,
        last_watermark: Any,
        last_pk: Optional[Any]
    ) -> Tuple[List[Dict[str, Any]], Optional[Tuple[Any, Any]]]:
        """
        按watermark增量拉取数据

        Args:
            last_watermark: 上次同步的水位值
            last_pk: 上次同步的主键值

        Returns:
            (增量数据列表, (最新watermark, 最新pk))的元组
        """
        records: List[Dict[str, Any]] = []
        cursor_wm = last_watermark
        # 复合主键从字符串还原为元组
        if isinstance(self.db_primary_key, list) and isinstance(last_pk, str):
            pk_parts = last_pk.split('|') if last_pk else []
            # 防御性校验：主键值数量必须与配置一致
            if len(pk_parts) != len(self.db_primary_key):
                self.logger.warning(
                    f"同步状态主键数量({len(pk_parts)})与当前配置({len(self.db_primary_key)})不匹配，"
                    f"可能是主键配置变更导致。将忽略旧状态，从 watermark 开始增量同步"
                )
                cursor_pk = None
            else:
                cursor_pk = tuple(pk_parts)
        else:
            cursor_pk = last_pk

        while True:
            batch = self.db_api.fetch_incremental_rows(
                self.db_table,
                self.db_primary_key,
                self.db_watermark_column,
                cursor_wm,
                cursor_pk,
                self.BATCH_SIZE
            )
            if not batch:
                break

            records.extend(batch)
            # 更新游标为当前批次最后一条记录的值
            last_record = batch[-1]
            cursor_wm = last_record[self.db_watermark_column]
            cursor_pk = self._get_pk_value(last_record)
            self.logger.debug(f"增量拉取批次 {len(batch)} 条，累计 {len(records)}")

        # 返回最终的水位和主键（如果有数据）
        if records:
            return records, (cursor_wm, cursor_pk)
        else:
            # 没有新数据，返回原水位
            return records, (last_watermark, last_pk) if last_pk is not None else None

    def _extract_latest_state(
        self,
        records: List[Dict[str, Any]]
    ) -> Tuple[Optional[Any], Optional[Any]]:
        """
        从记录列表中提取最新的watermark和主键

        Args:
            records: 数据记录列表

        Returns:
            (最新watermark, 最新主键)的元组，如果没有有效值则返回(None, None)
        """
        if not self.db_watermark_column or not records:
            return None, None

        # 找出watermark最大的记录
        valid_records = [
            r for r in records
            if r.get(self.db_watermark_column) is not None
        ]
        if not valid_records:
            return None, None

        latest_record = max(
            valid_records,
            key=lambda x: (x[self.db_watermark_column], self._get_pk_str(x))
        )
        return (
            latest_record[self.db_watermark_column],
            self._get_pk_value(latest_record)
        )

    def fetch_all_bitable_data(self) -> List[Dict[str, Any]]:
        """
        从多维表获取所有数据

        Returns:
            飞书多维表数据列表
        """
        all_data = []
        page_token = ''

        while True:
            result = self.feishu_api.get_bitable_records(
                self.table_id, self.READ_PAGE_SIZE, page_token
            )
            items = result.get('items', [])
            if not items:
                break

            all_data.extend(items)
            page_token = result.get('page_token', '')

            if not page_token:
                break

        return all_data

    def _fetch_targeted_bitable_data(
        self,
        db_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        目标精确查询：仅获取与数据库增量数据对应的飞书记录

        Args:
            db_data: 数据库增量数据列表

        Returns:
            飞书多维表数据列表（仅包含相关记录）
        """
        # 复合主键不支持目标精确查询，回退到全量
        if isinstance(self.db_primary_key, list):
            self.logger.info("复合主键不支持目标精确查询，使用全量获取")
            return self.fetch_all_bitable_data()

        bitable_id_field = self.field_mapping.get(self.db_primary_key)
        if not bitable_id_field:
            self.logger.warning("未配置主键映射，回退到全量查询")
            return self.fetch_all_bitable_data()

        # 提取并去重数据库 ID
        db_ids = []
        for item in db_data:
            pk_value = item.get(self.db_primary_key)
            if pk_value is not None:
                db_ids.append(str(pk_value))
        db_ids = list(dict.fromkeys(db_ids))  # 去重保序

        if not db_ids:
            return []

        def escape_filter_value(value: str) -> str:
            """转义飞书 filter 表达式中的特殊字符"""
            # 转义双引号和反斜杠
            return value.replace('\\', '\\\\').replace('"', '\\"')

        def build_filter(ids: List[str]) -> str:
            conditions = [f'CurrentValue.[{bitable_id_field}]="{escape_filter_value(mid)}"' for mid in ids]
            return conditions[0] if len(conditions) == 1 else f'OR({",".join(conditions)})'

        try:
            all_items = []
            chunk_size = 20  # 避免 filter 过长

            for i in range(0, len(db_ids), chunk_size):
                chunk = db_ids[i:i + chunk_size]
                filter_str = build_filter(chunk)

                page_token = ''
                while True:
                    result = self.feishu_api.get_bitable_records(
                        self.table_id,
                        page_size=self.READ_PAGE_SIZE,
                        page_token=page_token,
                        filter_str=filter_str
                    )
                    items = result.get('items', [])
                    if items:
                        all_items.extend(items)
                    page_token = result.get('page_token', '')
                    if not page_token:
                        break

            # 去重
            seen = set()
            deduped = []
            for item in all_items:
                rid = item.get('record_id')
                if rid and rid not in seen:
                    seen.add(rid)
                    deduped.append(item)
            return deduped

        except Exception as e:
            self.logger.warning(f"目标精确查询失败，回退到全量获取: {e}")
            return self.fetch_all_bitable_data()

    def generate_sync_plan(
        self,
        db_data: List[Dict[str, Any]],
        bitable_data: List[Dict[str, Any]],
        skip_delete: bool = False
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
        """
        生成同步计划

        Args:
            db_data: 数据库数据列表（全量或增量）
            bitable_data: 飞书多维表数据列表
            skip_delete: 是否跳过删除操作（增量模式下应设为True）

        Returns:
            (待更新记录, 待新增记录, 待删除记录ID列表)

        Raises:
            ValueError: 配置错误时抛出

        Note:
            增量模式下skip_delete=True，避免将未变更的记录误判为已删除
        """
        # 复合主键：使用所有主键字段组合作为唯一标识
        if isinstance(self.db_primary_key, list):
            pk_fields = self.db_primary_key
            bitable_pk_fields = [self.field_mapping.get(k) for k in pk_fields]
            if not all(bitable_pk_fields):
                missing = [k for k, v in zip(pk_fields, bitable_pk_fields) if not v]
                self.logger.error(f"未配置飞书多维表的主键字段映射: {missing}")
                raise ValueError(f"未配置飞书多维表的主键字段映射: {missing}")

            def get_bitable_pk_str(fields: Dict) -> str:
                return '|'.join(self._normalize_pk_value(fields.get(f, '')) for f in bitable_pk_fields)

            # 过滤掉缺少主键字段的记录
            valid_bitable = [
                item for item in bitable_data
                if all(f in item.get('fields', {}) for f in bitable_pk_fields)
            ]
            if len(valid_bitable) < len(bitable_data):
                self.logger.warning(f"过滤掉 {len(bitable_data) - len(valid_bitable)} 条缺少主键字段的记录")

            if not valid_bitable:
                self.logger.warning("过滤后无有效多维表记录，将全量新增")
                to_add = [{'fields': self.convert_to_bitable_fields(item)} for item in db_data]
                return [], to_add, []

            # 构建映射表
            db_id_map = {self._get_pk_str(item): item for item in db_data}
            bitable_id_map = {get_bitable_pk_str(item['fields']): item for item in valid_bitable}
        else:
            # 单主键逻辑
            bitable_id_field = self.field_mapping.get(self.db_primary_key)
            if not bitable_id_field:
                self.logger.error(f"未配置飞书多维表的主键字段映射（数据库主键: {self.db_primary_key}）")
                raise ValueError(f"未配置飞书多维表的主键字段映射（数据库主键: {self.db_primary_key}）")

            # 过滤掉缺少ID字段的记录
            missing_id_records = [
                item for item in bitable_data
                if bitable_id_field not in item.get('fields', {})
            ]
            if missing_id_records:
                self.logger.warning(f"发现 {len(missing_id_records)} 条记录缺少 {bitable_id_field} 字段")
                bitable_data = [
                    item for item in bitable_data
                    if bitable_id_field in item.get('fields', {})
                ]

            if not bitable_data:
                self.logger.warning("过滤后无有效多维表记录，将全量新增")
                to_add = [{'fields': self.convert_to_bitable_fields(item)} for item in db_data]
                return [], to_add, []

            db_id_map = {self._get_pk_str(item): item for item in db_data}
            bitable_id_map = {self._normalize_pk_value(item['fields'][bitable_id_field]): item for item in bitable_data}

        to_update = []
        to_add = []

        # 遍历数据库数据，找出需要更新和新增的记录
        for db_id, db_item in db_id_map.items():
            bitable_item = bitable_id_map.get(db_id)

            if bitable_item:
                # 记录已存在，检查是否需要更新
                if self.need_update(db_item, bitable_item['fields']):
                    to_update.append({
                        'record_id': bitable_item['record_id'],
                        'fields': self.convert_to_bitable_fields(db_item)
                    })
            else:
                # 记录不存在，需要新增
                to_add.append({
                    'fields': self.convert_to_bitable_fields(db_item)
                })

        # 找出需要删除的记录（飞书中存在但数据库中不存在）
        # 注意：增量模式下跳过删除，避免误删
        if skip_delete:
            to_delete = []
        else:
            to_delete = [
                bitable_item['record_id']
                for bitable_id, bitable_item in bitable_id_map.items()
                if bitable_id not in db_id_map
            ]

        return to_update, to_add, to_delete

    def need_update(
        self,
        db_item: Dict[str, Any],
        bitable_fields: Dict[str, Any]
    ) -> bool:
        """
        判断是否需要更新

        Args:
            db_item: 数据库记录
            bitable_fields: 飞书记录字段

        Returns:
            是否需要更新
        """
        # 排除主键字段，只比较其他字段
        pk_fields = self.db_primary_key if isinstance(self.db_primary_key, list) else [self.db_primary_key]
        fields_to_compare = {
            k: v for k, v in self.field_mapping.items()
            if k not in pk_fields
        }

        for db_field, bitable_field in fields_to_compare.items():
            db_value = db_item.get(db_field)
            bitable_value = bitable_fields.get(bitable_field)

            # 转换数据库值
            converted_db_value = self._convert_value(db_value)

            # 类型转换：飞书API返回的数字可能是字符串
            if isinstance(converted_db_value, (int, float)) and isinstance(bitable_value, str):
                try:
                    bitable_value = type(converted_db_value)(bitable_value)
                except (ValueError, TypeError):
                    pass  # 无法转换则保持原样

            # 处理None值和空字符串的等价性
            if self._is_equal_considering_null(converted_db_value, bitable_value):
                continue

            # 值不同，需要更新
            if converted_db_value != bitable_value:
                self.logger.debug(
                    f"记录 {self._get_pk_str(db_item)} 需要更新: "
                    f"字段 '{db_field}' 值不同 | "
                    f"DB: {converted_db_value!r} ({type(converted_db_value).__name__}) vs "
                    f"飞书: {bitable_value!r} ({type(bitable_value).__name__})"
                )
                return True

        return False

    def _is_equal_considering_null(
        self,
        value1: Any,
        value2: Any
    ) -> bool:
        """
        比较两个值，将None和空字符串视为相等

        Args:
            value1: 第一个值
            value2: 第二个值

        Returns:
            是否相等
        """
        if value1 is None and value2 in (None, ""):
            return True
        if value2 is None and value1 in (None, ""):
            return True
        if value1 == value2:
            return True
        return False

    def convert_to_bitable_fields(
        self,
        db_item: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        将数据库数据转换为多维表字段

        Args:
            db_item: 数据库记录

        Returns:
            转换后的飞书字段字典
        """
        fields = {}
        for db_field, bitable_field in self.field_mapping.items():
            if db_field not in db_item:
                self.logger.warning(f"字段映射错误: 数据库表中不存在字段 '{db_field}'")
                continue

            value = db_item[db_field]
            fields[bitable_field] = self._convert_value(value)

        return fields

    def _convert_value(self, value: Any) -> Any:
        """
        递归转换值的类型以符合JSON和飞书API的要求

        Args:
            value: 待转换的值

        Returns:
            转换后的值
        """
        if value is None:
            return None

        # datetime 转时间戳（毫秒）
        if isinstance(value, datetime.datetime):
            return int(value.timestamp() * 1000)

        # date 转当日零点时间戳（毫秒）
        if isinstance(value, datetime.date):
            dt = datetime.datetime.combine(value, datetime.time.min)
            return int(dt.timestamp() * 1000)

        # Decimal 转 float
        if isinstance(value, Decimal):
            return float(value)

        # 递归处理列表
        if isinstance(value, list):
            return [self._convert_value(item) for item in value]

        # 递归处理字典
        if isinstance(value, dict):
            return {k: self._convert_value(v) for k, v in value.items()}

        # 其他类型直接返回
        return value

    def execute_sync_operations(
        self,
        to_update: List[Dict[str, Any]],
        to_add: List[Dict[str, Any]],
        to_delete: List[str]
    ) -> None:
        """
        执行同步操作，包含更新、添加和删除

        Args:
            to_update: 待更新记录列表
            to_add: 待新增记录列表
            to_delete: 待删除记录ID列表
        """
        # 更新操作
        if to_update:
            self._batch_update_records(to_update)

        # 添加操作
        if to_add:
            self._batch_add_records(to_add)

        # 删除操作
        if to_delete:
            self._batch_delete_records(to_delete)

    def _batch_update_records(
        self,
        records: List[Dict[str, Any]]
    ) -> None:
        """批量更新记录"""
        total = len(records)
        self.logger.info(f"开始批量更新，共 {total} 条记录")

        for i in range(0, total, self.BATCH_SIZE):
            batch = records[i:i + self.BATCH_SIZE]
            batch_num = i // self.BATCH_SIZE + 1
            total_batches = (total - 1) // self.BATCH_SIZE + 1

            self.logger.info(
                f"更新批次 {batch_num}/{total_batches}: "
                f"{len(batch)} 条记录"
            )
            self.feishu_api.update_records(self.table_id, batch)
            self.logger.info(f"已完成 {min(i + self.BATCH_SIZE, total)}/{total} 条记录更新")

            time.sleep(self.RATE_LIMIT_DELAY)

    def _batch_add_records(
        self,
        records: List[Dict[str, Any]]
    ) -> None:
        """批量添加记录"""
        total = len(records)
        self.logger.info(f"开始批量添加，共 {total} 条记录")

        for i in range(0, total, self.BATCH_SIZE):
            batch = records[i:i + self.BATCH_SIZE]
            batch_num = i // self.BATCH_SIZE + 1
            total_batches = (total - 1) // self.BATCH_SIZE + 1

            self.logger.info(
                f"添加批次 {batch_num}/{total_batches}: "
                f"{len(batch)} 条记录"
            )

            try:
                self.feishu_api.add_records(self.table_id, batch)
                self.logger.info(f"已完成 {min(i + self.BATCH_SIZE, total)}/{total} 条记录添加")
            except Exception as e:
                self.logger.error(f"批次添加失败: {e}")
                if batch:
                    # 复合主键时使用第一个主键字段
                    pk_field = self.db_primary_key[0] if isinstance(self.db_primary_key, list) else self.db_primary_key
                    first_record_id = batch[0].get('fields', {}).get(
                        self.field_mapping.get(pk_field), 'unknown'
                    )
                    self.logger.error(f"问题批次首条记录ID: {first_record_id}")
                raise

            time.sleep(self.RATE_LIMIT_DELAY)

    def _batch_delete_records(
        self,
        record_ids: List[str]
    ) -> None:
        """批量删除记录"""
        total = len(record_ids)
        self.logger.info(f"开始批量删除，共 {total} 条记录")

        for i in range(0, total, self.DELETE_BATCH_SIZE):
            batch = record_ids[i:i + self.DELETE_BATCH_SIZE]
            batch_num = i // self.DELETE_BATCH_SIZE + 1
            total_batches = (total - 1) // self.DELETE_BATCH_SIZE + 1

            self.logger.info(
                f"删除批次 {batch_num}/{total_batches}: "
                f"{len(batch)} 条记录"
            )
            self.feishu_api.delete_records(self.table_id, batch)
            self.logger.info(f"已完成 {min(i + self.DELETE_BATCH_SIZE, total)}/{total} 条记录删除")

            time.sleep(self.RATE_LIMIT_DELAY)