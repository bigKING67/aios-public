"""飞书 Webhook 通知模块"""
import os
from typing import Any, Dict, List, Optional

import requests

from feishu_data_hub.infra.utils.logger import get_logger

logger = get_logger('通知模块')


class FeishuNotifier:
    """飞书 Webhook 通知器"""

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url or os.getenv('FEISHU_WEBHOOK_URL')
        if not self.webhook_url:
            logger.warning("未配置飞书 Webhook URL，通知功能已禁用")

    def send(self, title: str, content: List[List[Dict[str, Any]]]) -> bool:
        """
        发送富文本消息

        Args:
            title: 消息标题
            content: 富文本内容（飞书 post 格式）

        Returns:
            是否发送成功
        """
        payload = {
            "msg_type": "post",
            "content": {
                "post": {
                    "zh_cn": {
                        "title": title,
                        "content": content,
                    }
                }
            },
        }
        return self._send_payload(payload)

    def send_interactive_card(
        self,
        title: str,
        markdown_content: str,
        header_template: str = "blue",
    ) -> bool:
        """发送交互卡片消息（支持标题背景色）"""
        payload = {
            "msg_type": "interactive",
            "card": {
                "config": {
                    "wide_screen_mode": True,
                    "enable_forward": True,
                },
                "header": {
                    "template": header_template,
                    "title": {
                        "tag": "plain_text",
                        "content": title,
                    },
                },
                "elements": [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "lark_md",
                            "content": markdown_content,
                        },
                    }
                ],
            },
        }
        return self._send_payload(payload)

    def _send_payload(self, payload: Dict[str, Any]) -> bool:
        """统一发送 webhook payload"""
        if not self.webhook_url:
            return False

        try:
            resp = requests.post(self.webhook_url, json=payload, timeout=10)
            if resp.status_code == 200 and resp.json().get('code') == 0:
                logger.info("通知发送成功")
                return True

            logger.warning(f"通知发送失败: {resp.text}")
            return False
        except Exception as e:
            logger.warning(f"通知发送异常: {e}")
            return False

    def notify_sync_result(
        self,
        results: Dict[str, Dict[str, Any]],
        added_details: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        updated_details: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    ) -> bool:
        """
        发送同步结果通知

        Args:
            results: 同步结果 {表名: {updated, added, deleted, error?}}
            added_details: 新增记录详情 {表名: [记录列表]}
            updated_details: 更新记录详情 {表名: [记录列表]}
        """
        added_details = added_details or {}
        updated_details = updated_details or {}

        # 汇总统计
        total_added = sum(r.get('added', 0) for r in results.values() if 'error' not in r)
        total_updated = sum(r.get('updated', 0) for r in results.values() if 'error' not in r)
        total_deleted = sum(r.get('deleted', 0) for r in results.values() if 'error' not in r)
        failed_count = sum(1 for r in results.values() if 'error' in r)

        lines = []
        status_emoji = "✅" if failed_count == 0 else "⚠️"
        lines.append(
            f"{status_emoji} 同步完成 | 新增 {total_added} | 更新 {total_updated} | 删除 {total_deleted}"
        )

        # 各表详情
        for table_name, result in results.items():
            lines.append("")

            if 'error' in result:
                lines.append(f"❌ {table_name}: 失败")
                lines.append(f"  原因: {result['error'][:100]}")
                continue

            added = result.get('added', 0)
            updated = result.get('updated', 0)
            deleted = result.get('deleted', 0)

            lines.append(f"📊 {table_name}: +{added} / ~{updated} / -{deleted}")

            # 新增记录详情（最多显示3条）
            if added > 0 and table_name in added_details:
                records = added_details[table_name][:3]
                for rec in records:
                    summary = self._format_record_summary(rec)
                    lines.append(f"  ➕ {summary}")
                if added > 3:
                    lines.append(f"  ... 等 {added} 条")

            # 更新记录详情（最多显示3条）
            if updated > 0 and table_name in updated_details:
                records = updated_details[table_name][:3]
                for rec in records:
                    summary = self._format_record_summary(rec)
                    lines.append(f"  ✏️ {summary}")
                if updated > 3:
                    lines.append(f"  ... 等 {updated} 条")

        markdown_content = "\n".join(lines)
        return self.send_interactive_card(
            "飞书数据同步通知",
            markdown_content,
            header_template="blue",
        )

    def notify_error(self, error_type: str, error_message: str) -> bool:
        """
        发送错误通知

        Args:
            error_type: 错误类型（如 "数据库连接失败"、"配置错误" 等）
            error_message: 错误详情
        """
        lines = [
            f"❌ 同步任务失败",
            "",
            f"**错误类型**: {error_type}",
            f"**错误详情**: {error_message[:200]}",
            "",
            "请检查服务器状态或联系管理员处理。",
        ]
        markdown_content = "\n".join(lines)
        return self.send_interactive_card(
            "飞书数据同步异常告警",
            markdown_content,
            header_template="red",
        )

    def _format_record_summary(self, record: Dict[str, Any], max_len: int = 60) -> str:
        """格式化记录摘要"""
        # 优先显示关键字段
        key_fields = ['date', 'stat_date', 'live_start_time', 'shop_name', 'product_title']
        parts = []
        for key in key_fields:
            if key in record and record[key]:
                val = str(record[key])[:20]
                parts.append(val)
        if not parts:
            # 取前几个字段
            for _, v in list(record.items())[:3]:
                if v is not None:
                    parts.append(f"{str(v)[:15]}")
        summary = " | ".join(parts)
        return summary[:max_len] + "..." if len(summary) > max_len else summary
