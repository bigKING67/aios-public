"""飞书多维表与PostgreSQL数据同步工具主程序"""
import sys
import argparse
from typing import Dict, Any

from feishu_data_hub.sync.services import (
    DouyinTradeSaleSyncService,
    DouyinTradeSaleLiveSyncService,
    DouyinTradeSaleCardSyncService,
    TaobaoTradeSaleSyncService,
    XhsTradeSaleSyncService,
    TaobaoAlimamaScenarioSyncService,
    JdTradeSaleSyncService,
    WxTradeSaleSyncService,
)
from feishu_data_hub.infra.utils import get_logger, FeishuNotifier
from feishu_data_hub.infra.utils.exceptions import SyncException, ConfigException

logger = get_logger('同步主程序')


def parse_arguments() -> argparse.Namespace:
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description='飞书多维表与PostgreSQL数据同步工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python -m feishu_data_hub.sync.main                     # 同步所有表
  python -m feishu_data_hub.sync.main --douyin-trade-sale # 只同步抖音全店成交明细表
        """
    )
    parser.add_argument(
        '--douyin-trade-sale',
        action='store_true',
        help='同步抖音全店成交明细表'
    )
    parser.add_argument(
        '--douyin-trade-sale-live',
        action='store_true',
        help='同步抖音全店成交直播明细表'
    )
    parser.add_argument(
        '--douyin-trade-sale-card',
        action='store_true',
        help='同步抖音商品卡成交明细表'
    )
    parser.add_argument(
        '--taobao-trade-sale',
        action='store_true',
        help='同步天猫全店交易数据表'
    )
    parser.add_argument(
        '--xhs-trade-sale',
        action='store_true',
        help='同步小红书店铺交易数据表'
    )
    parser.add_argument(
        '--taobao-alimama-scenario',
        action='store_true',
        help='同步淘宝阿里妈妈场景营销数据表'
    )
    parser.add_argument(
        '--jd-trade-sale',
        action='store_true',
        help='同步京东店铺成交数据表'
    )
    parser.add_argument(
        '--wx-trade-sale',
        action='store_true',
        help='同步微信小程序店铺成交数据表'
    )

    return parser.parse_args()


def sync_services(args: argparse.Namespace) -> Dict[str, Dict[str, Any]]:
    """执行同步服务"""
    results = {}
    added_details = {}
    updated_details = {}
    services = []

    # 根据参数选择要同步的服务
    sync_all = not args.douyin_trade_sale and not args.douyin_trade_sale_live and not args.douyin_trade_sale_card and not args.taobao_trade_sale and not args.xhs_trade_sale and not args.taobao_alimama_scenario and not args.jd_trade_sale and not args.wx_trade_sale

    if sync_all or args.douyin_trade_sale:
        services.append(('抖音全店成交明细', DouyinTradeSaleSyncService()))
    if sync_all or args.douyin_trade_sale_live:
        services.append(('抖音全店成交直播明细', DouyinTradeSaleLiveSyncService()))
    if sync_all or args.douyin_trade_sale_card:
        services.append(('抖音商品卡成交明细', DouyinTradeSaleCardSyncService()))
    if sync_all or args.taobao_trade_sale:
        services.append(('天猫全店交易数据', TaobaoTradeSaleSyncService()))
    if sync_all or args.xhs_trade_sale:
        services.append(('小红书店铺交易数据', XhsTradeSaleSyncService()))
    if sync_all or args.taobao_alimama_scenario:
        services.append(('淘宝阿里妈妈场景营销', TaobaoAlimamaScenarioSyncService()))
    if sync_all or args.jd_trade_sale:
        services.append(('京东店铺成交数据', JdTradeSaleSyncService()))
    if sync_all or args.wx_trade_sale:
        services.append(('微信小程序店铺成交数据', WxTradeSaleSyncService()))

    # 执行同步（服务隔离：单服务失败不中断整体）
    for service_name, service in services:
        try:
            logger.info(f"开始同步 {service_name} 表...")
            result = service.sync()
            results[service_name] = result
            # 提取记录详情用于通知
            if result.get('added_records'):
                added_details[service_name] = result['added_records']
            if result.get('updated_records'):
                updated_details[service_name] = result['updated_records']
            logger.info(f"{service_name} 表同步成功")
        except Exception as e:
            logger.error(f"{service_name} 表同步失败: {e}", exc_info=True)
            results[service_name] = {'error': str(e), 'updated': 0, 'added': 0, 'deleted': 0}

    return results, added_details, updated_details


def print_summary(results: Dict[str, Dict[str, Any]]) -> None:
    """打印同步结果总结"""
    logger.info("\n" + "=" * 50)
    logger.info(" " * 18 + "同步总结")
    logger.info("=" * 50)

    total_updated = 0
    total_added = 0
    total_deleted = 0
    failed_services = []

    for table_name, result in results.items():
        if 'error' in result:
            failed_services.append(table_name)
            logger.info(f"{table_name}: 失败 - {result['error'][:50]}")
            continue

        updated = result.get('updated', 0)
        added = result.get('added', 0)
        deleted = result.get('deleted', 0)

        total_updated += updated
        total_added += added
        total_deleted += deleted

        logger.info(
            f"{table_name}: "
            f"更新 {updated:4d} 条, "
            f"新增 {added:4d} 条, "
            f"删除 {deleted:4d} 条"
        )

    logger.info("-" * 50)
    logger.info(
        f"总计: "
        f"更新 {total_updated:4d} 条, "
        f"新增 {total_added:4d} 条, "
        f"删除 {total_deleted:4d} 条"
    )
    if failed_services:
        logger.warning(f"失败服务: {', '.join(failed_services)}")
    logger.info("=" * 50 + "\n")


def main() -> int:
    """主函数"""
    logger.info('=' * 50)
    logger.info('飞书-PostgreSQL数据同步程序启动')
    logger.info('=' * 50)

    try:
        # 解析命令行参数
        args = parse_arguments()

        # 执行同步
        results, added_details, updated_details = sync_services(args)

        # 输出总结
        print_summary(results)

        # 发送飞书通知
        notifier = FeishuNotifier()
        notifier.notify_sync_result(results, added_details, updated_details)

        # 检查是否有失败的服务
        has_failures = any('error' in r for r in results.values())
        if has_failures:
            logger.warning('部分同步任务失败')
            return 1

        logger.info('所有同步任务完成')
        return 0

    except KeyboardInterrupt:
        logger.warning("用户中断程序")
        return 130

    except (SyncException, ConfigException) as e:
        logger.error(f"同步失败: {e}")
        # 发送错误通知
        try:
            notifier = FeishuNotifier()
            notifier.notify_error("同步异常", str(e))
        except Exception:
            pass
        return 1

    except Exception as e:
        logger.error(f"程序运行失败: {e}", exc_info=True)
        # 发送错误通知（包括数据库连接失败等）
        try:
            notifier = FeishuNotifier()
            error_type = "数据库连接失败" if "connection" in str(e).lower() or "timeout" in str(e).lower() else "程序异常"
            notifier.notify_error(error_type, str(e))
        except Exception:
            pass
        return 1


if __name__ == '__main__':
    sys.exit(main())
