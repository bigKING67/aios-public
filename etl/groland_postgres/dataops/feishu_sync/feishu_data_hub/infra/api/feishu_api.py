"""飞书API模块"""
from typing import Dict, List, Any, Optional
import time
from functools import wraps
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from feishu_data_hub.infra.config import get_feishu_config
from feishu_data_hub.infra.utils.logger import get_logger
from feishu_data_hub.infra.utils.exceptions import FeishuAPIException

logger = get_logger('飞书API')


def retry_on_failure(max_retries: int = 3, backoff_factor: float = 1.0):
    """失败重试装饰器"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except (requests.RequestException, FeishuAPIException) as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        wait_time = backoff_factor * (2 ** attempt)
                        logger.warning(
                            f"调用 {func.__name__} 失败 (尝试 {attempt + 1}/{max_retries}), "
                            f"{wait_time}秒后重试: {e}"
                        )
                        time.sleep(wait_time)
                    else:
                        logger.error(f"调用 {func.__name__} 失败，已达到最大重试次数")
            raise last_exception
        return wrapper
    return decorator


class FeishuAPI:
    """飞书API封装类"""

    def __init__(self, timeout: int = 30):
        self.access_token: Optional[str] = None
        self.expires_at: float = 0
        self.timeout = timeout
        self.session = self._create_session()
        self._config = None  # 延迟加载

    @property
    def config(self):
        """延迟加载配置"""
        if self._config is None:
            self._config = get_feishu_config()
        return self._config

    def _create_session(self) -> requests.Session:
        """创建带重试策略的Session"""
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS", "TRACE"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session

    def _get_access_token(self) -> str:
        """获取飞书AccessToken"""
        if self.access_token and self.expires_at > time.time() + 60:
            logger.debug("使用缓存的access token")
            return self.access_token

        logger.info("获取新的access token")
        url = f"{self.config['base_url']}/auth/v3/tenant_access_token/internal"

        try:
            response = self.session.post(
                url,
                json={
                    'app_id': self.config['app_id'],
                    'app_secret': self.config['app_secret'],
                },
                timeout=self.timeout
            )
            response.raise_for_status()
            result = response.json()

            if result.get('code') != 0:
                raise FeishuAPIException(
                    f"获取tenant_access_token失败: {result.get('msg')}",
                    code=result.get('code'),
                    response_data=result
                )

            self.access_token = result.get('tenant_access_token')
            self.expires_at = time.time() + result.get('expire', 7200)
            logger.info(f"成功获取access token，有效期至: {time.ctime(self.expires_at)}")
            return self.access_token

        except requests.RequestException as e:
            logger.error(f"获取access token网络请求失败: {e}")
            raise FeishuAPIException(f"获取access token网络请求失败: {e}")

    @retry_on_failure(max_retries=3, backoff_factor=1.0)
    def get_bitable_records(
        self,
        table_id: str,
        page_size: int = 100,
        page_token: str = '',
        filter_str: Optional[str] = None
    ) -> Dict[str, Any]:
        """获取多维表记录"""
        access_token = self._get_access_token()
        url = (
            f"{self.config['base_url']}/bitable/v1/apps/"
            f"{self.config['bitable']['app_token']}/tables/{table_id}/records"
        )

        logger.debug(
            f"获取多维表记录: table_id={table_id}, "
            f"page_size={page_size}, page_token={page_token[:10] if page_token else 'None'}..."
        )

        params = {'page_size': page_size}
        if page_token:
            params['page_token'] = page_token
        if filter_str:
            params['filter'] = filter_str

        try:
            response = self.session.get(
                url,
                headers={'Authorization': f'Bearer {access_token}'},
                params=params,
                timeout=self.timeout
            )
            response.raise_for_status()
            result = response.json()

            if result.get('code') != 0:
                raise FeishuAPIException(
                    f"获取多维表记录失败: {result.get('msg')}",
                    code=result.get('code'),
                    response_data=result
                )

            items = result.get('data', {}).get('items', [])
            logger.debug(f"成功获取 {len(items)} 条记录")
            return result.get('data', {})

        except requests.RequestException as e:
            logger.error(f"获取多维表记录网络请求失败: {e}")
            raise FeishuAPIException(f"获取多维表记录网络请求失败: {e}")

    @retry_on_failure(max_retries=3, backoff_factor=1.0)
    def update_records(self, table_id: str, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """批量更新记录"""
        access_token = self._get_access_token()
        url = (
            f"{self.config['base_url']}/bitable/v1/apps/"
            f"{self.config['bitable']['app_token']}/tables/{table_id}/records/batch_update"
        )

        logger.info(f"批量更新记录: table_id={table_id}, 记录数={len(records)}")

        try:
            response = self.session.post(
                url,
                headers={'Authorization': f'Bearer {access_token}'},
                json={'records': records},
                timeout=self.timeout
            )
            response.raise_for_status()
            result = response.json()

            if result.get('code') != 0:
                raise FeishuAPIException(
                    f"批量更新记录失败: {result.get('msg')}",
                    code=result.get('code'),
                    response_data=result
                )

            success_count = len(result.get('data', {}).get('records', []))
            logger.info(f"成功更新 {success_count} 条记录")
            return result.get('data', {})

        except requests.RequestException as e:
            logger.error(f"批量更新记录网络请求失败: {e}")
            raise FeishuAPIException(f"批量更新记录网络请求失败: {e}")

    @retry_on_failure(max_retries=3, backoff_factor=1.0)
    def add_records(self, table_id: str, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """批量插入记录"""
        access_token = self._get_access_token()
        url = (
            f"{self.config['base_url']}/bitable/v1/apps/"
            f"{self.config['bitable']['app_token']}/tables/{table_id}/records/batch_create"
        )

        logger.info(f"批量插入记录: table_id={table_id}, 记录数={len(records)}")

        try:
            response = self.session.post(
                url,
                headers={'Authorization': f'Bearer {access_token}'},
                json={'records': records},
                timeout=self.timeout
            )
            response.raise_for_status()
            result = response.json()

            if result.get('code') != 0:
                raise FeishuAPIException(
                    f"批量插入记录失败: {result.get('msg')}",
                    code=result.get('code'),
                    response_data=result
                )

            success_count = len(result.get('data', {}).get('records', []))
            logger.info(f"成功插入 {success_count} 条记录")
            return result.get('data', {})

        except requests.RequestException as e:
            logger.error(f"批量插入记录网络请求失败: {e}")
            raise FeishuAPIException(f"批量插入记录网络请求失败: {e}")

    @retry_on_failure(max_retries=3, backoff_factor=1.0)
    def delete_records(self, table_id: str, record_ids: List[str]) -> Dict[str, Any]:
        """批量删除记录"""
        access_token = self._get_access_token()
        url = (
            f"{self.config['base_url']}/bitable/v1/apps/"
            f"{self.config['bitable']['app_token']}/tables/{table_id}/records/batch_delete"
        )

        logger.info(f"批量删除记录: table_id={table_id}, 记录数={len(record_ids)}")

        try:
            response = self.session.post(
                url,
                headers={'Authorization': f'Bearer {access_token}'},
                json={'record_ids': record_ids},
                timeout=self.timeout
            )
            response.raise_for_status()
            result = response.json()

            if result.get('code') != 0:
                raise FeishuAPIException(
                    f"批量删除记录失败: {result.get('msg')}",
                    code=result.get('code'),
                    response_data=result
                )

            logger.info(f"成功删除 {len(record_ids)} 条记录")
            return result.get('data', {})

        except requests.RequestException as e:
            logger.error(f"批量删除记录网络请求失败: {e}")
            raise FeishuAPIException(f"批量删除记录网络请求失败: {e}")

    @retry_on_failure(max_retries=3, backoff_factor=1.0)
    def get_table_fields(self, table_id: str) -> List[Dict[str, Any]]:
        """获取多维表字段列表"""
        access_token = self._get_access_token()
        url = (
            f"{self.config['base_url']}/bitable/v1/apps/"
            f"{self.config['bitable']['app_token']}/tables/{table_id}/fields"
        )

        try:
            response = self.session.get(
                url,
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=self.timeout
            )
            response.raise_for_status()
            result = response.json()

            if result.get('code') != 0:
                raise FeishuAPIException(
                    f"获取字段列表失败: {result.get('msg')}",
                    code=result.get('code'),
                    response_data=result
                )

            return result.get('data', {}).get('items', [])

        except requests.RequestException as e:
            logger.error(f"获取字段列表网络请求失败: {e}")
            raise FeishuAPIException(f"获取字段列表网络请求失败: {e}")

    @retry_on_failure(max_retries=3, backoff_factor=1.0)
    def create_field(self, table_id: str, field_name: str, field_type: int = 1) -> Dict[str, Any]:
        """创建多维表字段"""
        access_token = self._get_access_token()
        url = (
            f"{self.config['base_url']}/bitable/v1/apps/"
            f"{self.config['bitable']['app_token']}/tables/{table_id}/fields"
        )

        logger.info(f"创建字段: {field_name} (类型={field_type})")

        try:
            response = self.session.post(
                url,
                headers={'Authorization': f'Bearer {access_token}'},
                json={'field_name': field_name, 'type': field_type},
                timeout=self.timeout
            )
            response.raise_for_status()
            result = response.json()

            if result.get('code') != 0:
                raise FeishuAPIException(
                    f"创建字段失败: {result.get('msg')}",
                    code=result.get('code'),
                    response_data=result
                )

            logger.info(f"成功创建字段: {field_name}")
            return result.get('data', {}).get('field', {})

        except requests.RequestException as e:
            logger.error(f"创建字段网络请求失败: {e}")
            raise FeishuAPIException(f"创建字段网络请求失败: {e}")

    def __del__(self):
        """析构函数，关闭Session"""
        if hasattr(self, 'session'):
            self.session.close()
