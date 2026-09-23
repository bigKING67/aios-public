"""PostgreSQL API模块"""
from typing import List, Dict, Any, Optional, Tuple, Union
from contextlib import contextmanager
import time
import psycopg2
from psycopg2 import pool, Error, sql
from psycopg2.extras import RealDictCursor

from feishu_data_hub.infra.config import get_postgres_config
from feishu_data_hub.infra.utils.logger import get_logger
from feishu_data_hub.infra.utils.exceptions import DatabaseException

logger = get_logger('PostgresAPI')


class PostgresAPI:
    """PostgreSQL数据库API封装类"""

    _pool: Optional[pool.ThreadedConnectionPool] = None
    MAX_EXEC_RETRIES = 2
    DISCONNECT_ERROR_KEYWORDS = (
        "server closed the connection unexpectedly",
        "connection already closed",
        "connection not open",
        "could not receive data from server",
        "connection reset by peer",
        "operation timed out",
        "broken pipe",
        "ssl syscall error: eof detected",
        "unexpected eof on client connection",
    )

    def __init__(self, min_conn: int = 1, max_conn: int = 5):
        if PostgresAPI._pool is None:
            self._init_pool(min_conn, max_conn)
        self.config = get_postgres_config()
        self.sync_state_table = self.config.get('sync_state_table', 'sync_state')
        self._ensure_sync_state_table()

    def _build_pool_kwargs(
        self,
        config: Dict[str, Any],
        min_conn: int,
        max_conn: int
    ) -> Dict[str, Any]:
        """构建连接池参数"""
        return {
            'minconn': min_conn,
            'maxconn': max_conn,
            'host': config['host'],
            'port': config['port'],
            'user': config['user'],
            'password': config['password'],
            'database': config['database'],
            'connect_timeout': config['connect_timeout'],
            'keepalives': 1,
            'keepalives_idle': config['keepalives_idle'],
            'keepalives_interval': config['keepalives_interval'],
            'keepalives_count': config['keepalives_count'],
            'application_name': 'feishu-data-hub-sync',
        }

    def _validate_pool_connection(self) -> None:
        """初始化后做一次探测，确保连接池可用"""
        if PostgresAPI._pool is None:
            raise DatabaseException("连接池尚未初始化")

        connection = self._checkout_healthy_connection()
        PostgresAPI._pool.putconn(connection)

    def _is_disconnect_error(self, error: Exception) -> bool:
        """判断异常是否属于连接中断类错误"""
        if isinstance(error, (psycopg2.OperationalError, psycopg2.InterfaceError)):
            return True
        message = str(error).lower()
        return any(keyword in message for keyword in self.DISCONNECT_ERROR_KEYWORDS)

    def _checkout_healthy_connection(self):
        """获取并校验连接池中的可用连接，坏连接会被剔除"""
        if PostgresAPI._pool is None:
            raise DatabaseException("连接池尚未初始化")

        max_attempts = 2
        last_error: Optional[Exception] = None

        for attempt in range(1, max_attempts + 1):
            connection = None
            try:
                connection = PostgresAPI._pool.getconn()
                if connection.closed:
                    raise psycopg2.InterfaceError("连接已关闭")
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1")
                return connection
            except Error as error:
                last_error = error
                if connection is not None:
                    PostgresAPI._pool.putconn(connection, close=True)
                if attempt < max_attempts:
                    logger.warning(
                        "连接健康检查失败，准备重试获取连接 (%s/%s): %s",
                        attempt,
                        max_attempts,
                        error,
                    )
                    time.sleep(0.2 * attempt)

        raise DatabaseException(f"获取可用数据库连接失败: {last_error}")

    def _init_pool(self, min_conn: int, max_conn: int) -> None:
        """初始化连接池"""
        config = get_postgres_config()
        max_retries = config['pool_init_retries']
        backoff_seconds = config['pool_retry_backoff_seconds']
        pool_kwargs = self._build_pool_kwargs(config, min_conn, max_conn)

        logger.info(
            "初始化PostgreSQL连接池，大小: %s-%s, connect_timeout=%ss, retries=%s",
            min_conn,
            max_conn,
            config['connect_timeout'],
            max_retries
        )

        last_error: Optional[Exception] = None
        for attempt in range(1, max_retries + 1):
            try:
                PostgresAPI._pool = pool.ThreadedConnectionPool(**pool_kwargs)
                self._validate_pool_connection()
                logger.info("PostgreSQL连接池初始化成功")
                return
            except (Error, DatabaseException) as e:
                last_error = e
                if PostgresAPI._pool:
                    PostgresAPI._pool.closeall()
                    PostgresAPI._pool = None

                if attempt >= max_retries:
                    break

                wait_seconds = backoff_seconds * (2 ** (attempt - 1))
                logger.warning(
                    "初始化PostgreSQL连接池失败（第 %s/%s 次）: %s；%.1f 秒后重试",
                    attempt,
                    max_retries,
                    e,
                    wait_seconds
                )
                time.sleep(wait_seconds)

        logger.error("初始化PostgreSQL连接池失败，已达到最大重试次数: %s", max_retries)
        raise DatabaseException(f"初始化PostgreSQL连接池失败: {last_error}")

    def _ensure_sync_state_table(self) -> None:
        """确保同步状态表存在（首次运行自动创建）"""
        table_id = self._parse_table_name(self.sync_state_table)
        create_sql = sql.SQL(
            """
            CREATE TABLE IF NOT EXISTS {} (
                service_name TEXT PRIMARY KEY,
                last_watermark TEXT,
                last_primary_key TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        ).format(table_id)
        self.execute(create_sql)

    @contextmanager
    def get_connection(self):
        """获取数据库连接的上下文管理器"""
        connection = None
        should_discard = False
        try:
            logger.debug("从连接池获取数据库连接")
            connection = self._checkout_healthy_connection()
            yield connection
        except Error as e:
            should_discard = self._is_disconnect_error(e)
            if should_discard:
                logger.warning(f"检测到断连异常，连接将被丢弃: {e}")
            raise
        finally:
            if connection:
                PostgresAPI._pool.putconn(
                    connection,
                    close=should_discard or bool(connection.closed)
                )
                logger.debug("数据库连接已归还到连接池")

    def query(
        self,
        sql_str: Union[str, sql.Composable],
        params: Optional[Tuple] = None,
        fetch_one: bool = False
    ) -> List[Dict[str, Any]]:
        """执行SQL查询"""
        sql_preview = str(sql_str)[:100] if isinstance(sql_str, sql.Composable) else sql_str[:100]
        for attempt in range(1, self.MAX_EXEC_RETRIES + 1):
            try:
                with self.get_connection() as connection:
                    cursor = connection.cursor(cursor_factory=RealDictCursor)
                    try:
                        logger.debug(f"执行SQL查询: {sql_preview}...")
                        cursor.execute(sql_str, params or ())

                        if fetch_one:
                            result = cursor.fetchone()
                            return [dict(result)] if result else []

                        result = cursor.fetchall()
                        logger.debug(f"查询返回 {len(result)} 条记录")
                        return [dict(row) for row in result]
                    finally:
                        try:
                            cursor.close()
                        except Error:
                            pass
                        try:
                            connection.rollback()
                        except Error:
                            pass
            except DatabaseException as e:
                if attempt < self.MAX_EXEC_RETRIES:
                    logger.warning(
                        "执行SQL查询前获取连接失败，准备重试 (%s/%s): %s",
                        attempt,
                        self.MAX_EXEC_RETRIES,
                        e,
                    )
                    continue
                raise
            except Error as e:
                if attempt < self.MAX_EXEC_RETRIES and self._is_disconnect_error(e):
                    logger.warning(
                        "执行SQL查询遇到断连异常，准备重试 (%s/%s): %s",
                        attempt,
                        self.MAX_EXEC_RETRIES,
                        e,
                    )
                    continue
                logger.error(f"执行PostgreSQL查询失败: {e}, SQL: {sql_preview}...")
                raise DatabaseException(f"执行PostgreSQL查询失败: {e}")

        raise DatabaseException("执行PostgreSQL查询失败: 达到最大重试次数")

    def execute(
        self,
        sql_str: Union[str, sql.Composable],
        params: Optional[Tuple] = None
    ) -> int:
        """执行SQL语句（INSERT/UPDATE/DELETE）"""
        sql_preview = str(sql_str)[:100] if isinstance(sql_str, sql.Composable) else sql_str[:100]
        for attempt in range(1, self.MAX_EXEC_RETRIES + 1):
            try:
                with self.get_connection() as connection:
                    cursor = connection.cursor()
                    try:
                        logger.debug(f"执行SQL语句: {sql_preview}...")
                        cursor.execute(sql_str, params or ())
                        connection.commit()
                        affected_rows = cursor.rowcount
                        logger.debug(f"执行成功，影响 {affected_rows} 行")
                        return affected_rows
                    except Error:
                        try:
                            connection.rollback()
                        except Error:
                            pass
                        raise
                    finally:
                        try:
                            cursor.close()
                        except Error:
                            pass
            except DatabaseException as e:
                if attempt < self.MAX_EXEC_RETRIES:
                    logger.warning(
                        "执行SQL语句前获取连接失败，准备重试 (%s/%s): %s",
                        attempt,
                        self.MAX_EXEC_RETRIES,
                        e,
                    )
                    continue
                raise
            except Error as e:
                if attempt < self.MAX_EXEC_RETRIES and self._is_disconnect_error(e):
                    logger.warning(
                        "执行SQL语句遇到断连异常，准备重试 (%s/%s): %s",
                        attempt,
                        self.MAX_EXEC_RETRIES,
                        e,
                    )
                    continue
                logger.error(f"执行PostgreSQL语句失败: {e}, SQL: {sql_preview}...")
                raise DatabaseException(f"执行PostgreSQL语句失败: {e}")

        raise DatabaseException("执行PostgreSQL语句失败: 达到最大重试次数")

    def _parse_table_name(self, table_name: str) -> sql.Composable:
        """安全解析表名（支持 schema.table 格式）"""
        if '.' in table_name:
            schema, table = table_name.split('.', 1)
            return sql.SQL('{}.{}').format(sql.Identifier(schema), sql.Identifier(table))
        return sql.Identifier(table_name)

    def get_table_data_keyset(
        self,
        table_name: str,
        primary_key,
        last_pk: Optional[Any],
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """使用 Keyset 分页获取表数据"""
        table_id = self._parse_table_name(table_name)

        if isinstance(primary_key, list):
            pk_cols = sql.SQL(', ').join(sql.Identifier(k) for k in primary_key)
            if last_pk is None:
                query = sql.SQL("SELECT * FROM {} ORDER BY {} LIMIT %s").format(table_id, pk_cols)
                return self.query(query, (limit,))
            else:
                pk_placeholders = sql.SQL(', ').join(sql.Placeholder() for _ in primary_key)
                query = sql.SQL("SELECT * FROM {} WHERE ({}) > ({}) ORDER BY {} LIMIT %s").format(
                    table_id, pk_cols, pk_placeholders, pk_cols
                )
                return self.query(query, (*last_pk, limit))
        else:
            pk_col = sql.Identifier(primary_key)
            if last_pk is None:
                query = sql.SQL("SELECT * FROM {} ORDER BY {} LIMIT %s").format(table_id, pk_col)
                return self.query(query, (limit,))
            else:
                query = sql.SQL("SELECT * FROM {} WHERE {} > %s ORDER BY {} LIMIT %s").format(
                    table_id, pk_col, pk_col
                )
                return self.query(query, (last_pk, limit))

    def fetch_incremental_rows(
        self,
        table_name: str,
        primary_key,
        watermark_column: str,
        last_watermark: Any,
        last_primary_key: Optional[Any],
        limit: int
    ) -> List[Dict[str, Any]]:
        """基于watermark的增量查询"""
        table_id = self._parse_table_name(table_name)
        wm_col = sql.Identifier(watermark_column)

        if isinstance(primary_key, list):
            pk_cols = sql.SQL(', ').join(sql.Identifier(k) for k in primary_key)
            if last_primary_key is None:
                query = sql.SQL(
                    "SELECT * FROM {} WHERE {} > %s ORDER BY {}, {} LIMIT %s"
                ).format(table_id, wm_col, wm_col, pk_cols)
                return self.query(query, (last_watermark, limit))
            else:
                pk_placeholders = sql.SQL(', ').join(sql.Placeholder() for _ in primary_key)
                query = sql.SQL(
                    "SELECT * FROM {} WHERE {} > %s OR ({} = %s AND ({}) > ({})) ORDER BY {}, {} LIMIT %s"
                ).format(table_id, wm_col, wm_col, pk_cols, pk_placeholders, wm_col, pk_cols)
                return self.query(query, (last_watermark, last_watermark, *last_primary_key, limit))
        else:
            pk_col = sql.Identifier(primary_key)
            if last_primary_key is None:
                query = sql.SQL(
                    "SELECT * FROM {} WHERE {} > %s ORDER BY {}, {} LIMIT %s"
                ).format(table_id, wm_col, wm_col, pk_col)
                return self.query(query, (last_watermark, limit))
            else:
                query = sql.SQL(
                    "SELECT * FROM {} WHERE {} > %s OR ({} = %s AND {} > %s) ORDER BY {}, {} LIMIT %s"
                ).format(table_id, wm_col, wm_col, pk_col, wm_col, pk_col)
                return self.query(query, (last_watermark, last_watermark, last_primary_key, limit))

    def get_sync_state(self, service_key: str) -> Optional[Dict[str, Any]]:
        """读取指定服务的同步水位"""
        table_id = self._parse_table_name(self.sync_state_table)
        query = sql.SQL(
            "SELECT last_watermark, last_primary_key FROM {} WHERE service_name = %s"
        ).format(table_id)
        rows = self.query(query, (service_key,), fetch_one=True)
        return rows[0] if rows else None

    def upsert_sync_state(self, service_key: str, new_watermark: Any, new_primary_key: Any) -> None:
        """更新或写入最新同步水位和主键"""
        table_id = self._parse_table_name(self.sync_state_table)
        query = sql.SQL(
            """
            INSERT INTO {}(service_name, last_watermark, last_primary_key, updated_at)
            VALUES(%s, %s, %s, NOW())
            ON CONFLICT (service_name) DO UPDATE SET
            last_watermark = EXCLUDED.last_watermark,
            last_primary_key = EXCLUDED.last_primary_key,
            updated_at = NOW()
            """
        ).format(table_id)
        self.execute(query, (service_key, str(new_watermark), str(new_primary_key)))

    @classmethod
    def close_pool(cls) -> None:
        """关闭连接池"""
        if cls._pool:
            cls._pool.closeall()
            cls._pool = None
            logger.info("PostgreSQL连接池已关闭")

    def get_column_types(self, table_name: str) -> Dict[str, str]:
        """获取表的字段类型信息"""
        if '.' in table_name:
            schema, table = table_name.split('.', 1)
        else:
            schema, table = 'public', table_name

        sql_str = """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
        """
        rows = self.query(sql_str, (schema, table))
        return {row['column_name']: row['data_type'] for row in rows}
